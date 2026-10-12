use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use fs2::FileExt;
use paykit::*;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    fs::OpenOptions,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

const APP: &str = "paykit-server";
const ENDPOINT: &str = "btc-regtest-p2wpkh";

#[derive(Parser)]
#[command(about = "Real rc71 Paykit sender for Bitkit fixed-price journeys")]
struct Args {
    #[arg(long, default_value = "state")]
    state: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Create a separate staging identity and publish the fixture profile/app.
    Init {
        #[arg(long, default_value = "https://homegate.staging.pubky.app")]
        homegate: String,
        /// Use this homeserver and PAYKIT_SIGNUP_CODE instead of Homegate.
        #[arg(long)]
        homeserver: Option<String>,
    },
    /// Add the peer and advance linking. Add this sender as a contact in Bitkit too.
    Link {
        peer: String,
        #[arg(long, default_value_t = 120)]
        timeout: u64,
    },
    /// Send one fresh journey request. Does not execute a Bitcoin payment.
    Send {
        peer: String,
        #[arg(value_enum)]
        case: Option<Preset>,
        #[command(flatten)]
        options: RequestOptions,
    },
    /// Receive messages and retry delivery (including after a failed send).
    Poll {
        #[arg(long, default_value_t = 30)]
        seconds: u64,
    },
    /// Print this sender's public identity and persisted requests.
    Status,
    /// Print exact terms without identity setup or network access.
    Preview {
        #[arg(value_enum)]
        case: Option<Preset>,
        #[command(flatten)]
        options: RequestOptions,
    },
}

#[derive(clap::Args)]
struct RequestOptions {
    #[arg(long)]
    address: String,
    /// Requested denomination, e.g. btc, usd, usdt.
    #[arg(long)]
    asset: Option<String>,
    /// Decimal requested amount. Preserved exactly in Paykit terms.
    #[arg(long)]
    amount: Option<String>,
    /// Fixed payment-asset units per requested unit; repeat for rail overrides.
    /// Example: --rate btc=0.000021 --rate btc-regtest=0.5
    #[arg(long = "rate", value_name = "SELECTOR=VALUE")]
    rates: Vec<String>,
    #[arg(long)]
    note: Option<String>,
    #[arg(long, default_value_t = 86400)]
    expires_in: u32,
}

#[derive(Clone, Copy, ValueEnum)]
enum Preset {
    Usd,
    Btc,
}

#[derive(Serialize, Deserialize)]
struct Identity {
    public_key: Option<String>,
    key: Vec<u8>,
    session: Option<String>,
}

struct Store(PathBuf);
fn storage_error(e: impl std::fmt::Display) -> PaykitFfiError {
    PaykitFfiError::Storage {
        code: "fixture_storage".into(),
        context: e.to_string(),
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(temp, path)?;
    fs::File::open(path.parent().unwrap())?.sync_all()?;
    Ok(())
}

impl FfiSdkStateBlobStore for Store {
    fn load_state_blob(
        &self,
    ) -> std::result::Result<Option<FfiSdkStateBlobSnapshot>, PaykitFfiError> {
        match fs::read(&self.0) {
            Ok(bytes) => decode_sdk_state_blob_snapshot(bytes).map(Some),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(storage_error(e)),
        }
    }
    fn save_state_blob_atomically(
        &self,
        blob: Arc<FfiSdkStateBlob>,
        expected: Option<String>,
    ) -> std::result::Result<String, PaykitFfiError> {
        let current = self.load_state_blob()?.map(|s| s.revision);
        if current != expected {
            return Err(PaykitFfiError::ConcurrentUpdate {
                code: "revision_changed".into(),
                context: "fixture SDK state changed".into(),
            });
        }
        let revision = format!("{:032x}", rand::random::<u128>());
        let bytes = encode_sdk_state_blob_snapshot(FfiSdkStateBlobSnapshot {
            blob,
            revision: revision.clone(),
        })?;
        atomic_write(&self.0, &bytes).map_err(storage_error)?;
        Ok(revision)
    }
}

struct Session(Mutex<Option<Arc<FfiPubkySessionAccess>>>);
impl FfiSdkPubkySessionProvider for Session {
    fn load_session_access(
        &self,
    ) -> std::result::Result<Option<Arc<FfiPubkySessionAccess>>, PaykitFfiError> {
        Ok(self.0.lock().map_err(storage_error)?.clone())
    }
    fn public_storage_available(&self) -> std::result::Result<bool, PaykitFfiError> {
        Ok(true)
    }
    fn clear_session_access(&self) -> std::result::Result<(), PaykitFfiError> {
        *self.0.lock().map_err(storage_error)? = None;
        Ok(())
    }
}

#[cfg(test)]
fn terms(case: Preset, address: &str) -> Result<(FfiPaymentRequestTerms, serde_json::Value)> {
    custom_terms(
        Some(case),
        &RequestOptions {
            address: address.into(),
            asset: None,
            amount: None,
            rates: vec![],
            note: None,
            expires_in: 86400,
        },
    )
}

fn custom_terms(
    case: Option<Preset>,
    options: &RequestOptions,
) -> Result<(FfiPaymentRequestTerms, serde_json::Value)> {
    let address = &options.address;
    let parsed: bitcoin::Address<bitcoin::address::NetworkUnchecked> =
        address.parse().context("invalid Bitcoin address")?;
    let parsed = parsed
        .require_network(bitcoin::Network::Regtest)
        .context("address must be regtest")?;
    if parsed.address_type() != Some(bitcoin::AddressType::P2wpkh) {
        bail!("use a regtest P2WPKH address (bcrt1q...)");
    }
    let (default_value, default_asset, default_rates) = match case {
        Some(Preset::Usd) => ("10", "usd", vec![("btc", "0.000021")]),
        Some(Preset::Btc) => ("0.001", "btc", vec![("btc", "2"), ("btc-regtest", "0.5")]),
        None => ("", "", vec![]),
    };
    let value = options.amount.as_deref().unwrap_or(default_value);
    let asset = options.asset.as_deref().unwrap_or(default_asset);
    if value.is_empty() || asset.is_empty() {
        bail!("choose usd/btc preset or provide both --amount and --asset");
    }
    if options.expires_in == 0 {
        bail!("--expires-in must be greater than zero");
    }
    let rates: Vec<(&str, &str)> = if options.rates.is_empty() {
        default_rates
    } else {
        options
            .rates
            .iter()
            .map(|r| {
                r.split_once('=')
                    .context("rate must be SELECTOR=VALUE, e.g. btc=0.000021")
            })
            .collect::<Result<_>>()?
    };
    let selected_rate = rates
        .iter()
        .find(|(a, _)| *a == "btc-regtest")
        .or_else(|| rates.iter().find(|(a, _)| *a == "btc"))
        .map(|(_, v)| *v)
        .or_else(|| (asset == "btc").then_some("1"));
    let sats = selected_rate.and_then(|rate| estimate_sats(value, rate));
    let note = options
        .note
        .clone()
        .unwrap_or_else(|| format!("Fixed-price fixture: {value} {asset}"));
    let reference = format!("fixture-{:032x}", rand::random::<u128>());
    let expiry = (chrono::Utc::now() + chrono::Duration::seconds(i64::from(options.expires_in)))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let payload = serde_json::json!({"value":address}).to_string();
    let mut json = serde_json::json!({"amount":{"value":value,"asset":asset},"conversion":{"type":"fixed","rates":rates.iter().map(|(a,v)|serde_json::json!({"asset":a,"value":v})).collect::<Vec<_>>()},"accepted_payment_endpoint_identifiers":[ENDPOINT],"payment_endpoints":{ENDPOINT:payload},"required_app_id":APP,"payment_reference":reference,"proposal_expires_at":expiry,"metadata":{"note":note},"expected_sats":sats});
    if rates.is_empty() {
        json.as_object_mut().unwrap().remove("conversion");
    }
    let terms = FfiPaymentRequestTerms {
        amount: FfiPaymentRequestAmount {
            value: value.into(),
            asset: asset.into(),
        },
        payment_reference: Arc::new(FfiPaymentReference::new(reference)?),
        proposal_expires_at: Some(expiry),
        recurrence: None,
        accepted_payment_endpoint_identifiers: vec![ENDPOINT.into()],
        payment_endpoints: Some(HashMap::from([(ENDPOINT.into(), payload)])),
        required_app_id: Some(APP.into()),
        conversion: (!rates.is_empty()).then(|| FfiPaymentConversion::Fixed {
            rates: rates
                .into_iter()
                .map(|(a, v)| FfiConversionRate {
                    asset: a.into(),
                    value: v.into(),
                })
                .collect(),
        }),
        payment_deadline: None,
        metadata: Arc::new(FfiPrivateJsonObject::new(json["metadata"].to_string())?),
    };
    let _: paykit_lib::PaymentRequestTerms = terms.clone().try_into()?;
    Ok((terms, json))
}

// Optional preview estimate; never changes the SDK's exact decimal request terms.
fn estimate_sats(amount: &str, rate: &str) -> Option<u64> {
    fn decimal(s: &str) -> Option<(u128, u32)> {
        let (whole, fraction) = s.split_once('.').unwrap_or((s, ""));
        let digits = format!("{whole}{fraction}");
        Some((digits.parse().ok()?, fraction.len().try_into().ok()?))
    }
    let (a, sa) = decimal(amount)?;
    let (b, sb) = decimal(rate)?;
    let product = a.checked_mul(b)?.checked_mul(100_000_000)?;
    let denominator = 10u128.checked_pow(sa.checked_add(sb)?)?;
    u64::try_from(product / denominator + u128::from(product % denominator != 0)).ok()
}

async fn sdk(state: &Path, access: Arc<FfiPubkySessionAccess>) -> Result<FfiPaykitSdk> {
    let sdk = FfiPaykitSdk::new(
        Arc::new(Store(state.join("sdk.bin"))),
        Arc::new(Session(Mutex::new(Some(access)))),
        default_config(APP.into())?,
    )?;
    let identity = sdk.initialize().await?;
    if identity.capability != FfiPubkyIdentityCapability::PrivateLinkCapable {
        bail!("sender identity lacks private-link capability");
    }
    Ok(sdk)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    if let Command::Preview { case, options } = &args.command {
        println!(
            "{}",
            serde_json::to_string_pretty(&custom_terms(*case, options)?.1)?
        );
        return Ok(());
    }
    let mut prepared = match &args.command {
        Command::Send { case, options, .. } => Some(custom_terms(*case, options)?),
        _ => None,
    };
    fs::create_dir_all(&args.state)?;
    fs::set_permissions(&args.state, fs::Permissions::from_mode(0o700))?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .open(args.state.join("sender.lock"))?;
    lock.try_lock_exclusive().context(
        "another sender process is using this state; stop poll before running another command",
    )?;
    let identity_path = args.state.join("identity.json");
    let bootstrap = FfiPubkySessionBootstrap::new(APP.into())?;
    if let Command::Init {
        homegate,
        homeserver,
    } = &args.command
    {
        let identity_exists = identity_path.exists();
        let mut identity = if identity_exists {
            serde_json::from_slice::<Identity>(&fs::read(&identity_path)?)?
        } else {
            Identity {
                public_key: None,
                key: rand::random::<[u8; 32]>().to_vec(),
                session: None,
            }
        };
        if !identity_exists {
            atomic_write(&identity_path, &serde_json::to_vec(&identity)?)?;
        }
        let key = Arc::new(FfiPubkyLocalSecretKey::new(identity.key.clone()));
        let access = if let Some(secret) = identity.session.as_ref() {
            Arc::new(FfiPubkySessionAccess::new(
                APP.into(),
                secret.clone(),
                Some(key),
                None,
            )?)
        } else {
            let (server, code) = if let Some(server) = homeserver {
                (server.clone(), std::env::var("PAYKIT_SIGNUP_CODE").ok())
            } else {
                let response = reqwest::Client::builder()
                    .timeout(Duration::from_secs(30))
                    .build()?
                    .post(format!(
                        "{}/ip_verification",
                        homegate.trim_end_matches('/')
                    ))
                    .send()
                    .await?
                    .error_for_status()?
                    .json::<serde_json::Value>()
                    .await?;
                (
                    response["homeserverPubky"]
                        .as_str()
                        .context("Homegate omitted homeserverPubky")?
                        .to_string(),
                    Some(
                        response["signupCode"]
                            .as_str()
                            .context("Homegate omitted signupCode")?
                            .to_string(),
                    ),
                )
            };
            let result=bootstrap.sign_up(key,server,code,"/:rw".into()).await.context("sender signup failed; retry init with --homeserver and PAYKIT_SIGNUP_CODE if Homegate is rate-limited")?;
            identity.public_key = Some(result.public_key);
            identity.session = Some(result.session_access.export_session_secret());
            atomic_write(&identity_path, &serde_json::to_vec(&identity)?)?;
            result.session_access
        };
        let sdk = sdk(&args.state, access).await?;
        let public_key = identity
            .public_key
            .clone()
            .context("issuer public key missing")?;
        match sdk.paykit_noise_key_authorization(public_key.clone()).await {
            Ok(_) => {}
            Err(PaykitFfiError::NotFound { .. }) => {
                sdk.publish_paykit_noise_key_authorization().await?;
            }
            Err(error) => return Err(error).context("checking existing issuer authorization"),
        }
        sdk.publish_paykit_app(
            "Fixed Price QA Issuer".into(),
            FfiPaykitAppCapabilities {
                private_payments: true,
                payment_requests: true,
                receipts: false,
                outgoing_payments: false,
            },
        )
        .await?;
        let desired_profile = FfiPaykitProfile {
            display_name: Some("Fixed Price QA Issuer".into()),
            image_uri: None,
            extra_json: None,
        };
        let current_profile = sdk.fetch_paykit_profile(public_key).await?;
        if current_profile.as_ref().map(|p| &p.profile) != Some(&desired_profile) {
            sdk.publish_paykit_profile(desired_profile, current_profile.map(|p| p.revision))
                .await
                .context("publishing issuer profile with its current revision")?;
        }
        println!(
            "Issuer: {}\nAdd this identity as a contact in each Bitkit fixture.",
            identity.public_key.context("issuer public key missing")?
        );
        return Ok(());
    }
    let identity: Identity =
        serde_json::from_slice(&fs::read(&identity_path).context("run init first")?)?;
    println!(
        "Issuer: {}",
        identity.public_key.as_deref().unwrap_or("unknown")
    );
    let access = Arc::new(FfiPubkySessionAccess::new(
        APP.into(),
        identity.session.context("run init first")?,
        Some(Arc::new(FfiPubkyLocalSecretKey::new(identity.key))),
        None,
    )?);
    let sdk = sdk(&args.state, access).await?;
    match args.command {
        Command::Link { peer, timeout } => {
            let peer = normalize_pubky_public_key(peer)?;
            sdk.save_contact(FfiContactUpdate {
                public_key: peer.clone(),
                label: None,
            })
            .await?;
            tokio::time::timeout(Duration::from_secs(timeout), async {
                loop {
                    let report = sdk.ensure_link_with_peer(peer.clone(), 4).await?;
                    println!("Link: {:?}", report);
                    if sdk
                        .linked_peers()
                        .await?
                        .iter()
                        .any(|p| p.counterparty == peer && p.state == FfiLinkedPeerState::Linked)
                    {
                        return Ok::<_, anyhow::Error>(());
                    }
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            })
            .await
            .context(
                "link timed out; keep Bitkit open and add the issuer as a contact, then retry",
            )??;
        }
        Command::Send {
            peer,
            case: _,
            options,
        } => {
            let peer = normalize_pubky_public_key(peer)?;
            let (terms, json) = prepared
                .take()
                .expect("send terms validated before session setup");
            let address = &options.address;
            if !sdk
                .linked_peers()
                .await?
                .iter()
                .any(|p| p.counterparty == peer && p.state == FfiLinkedPeerState::Linked)
            {
                bail!("peer is not linked; run link first");
            }
            sdk.sync_public_endpoints_with_receiving_details(vec![FfiPublicReceivingDetail {
                identifier: ENDPOINT.into(),
                payload: Arc::new(FfiPaymentPayload::new(
                    serde_json::json!({"value":address}).to_string(),
                )),
            }])
            .await?;
            let record = sdk.propose_payment_request(peer.clone(), terms).await?;
            let receipt = serde_json::json!({"payment_request_id":record.payment_request_id,"terms":json,"sdk_revision":"e4e58d3ee6c6aa19d6262d4cd96a58890a65b6fa"});
            atomic_write(
                &args
                    .state
                    .join(format!("request-{}.json", record.payment_request_id)),
                &serde_json::to_vec_pretty(&receipt)?,
            )?;
            println!(
                "Request: {}\nExpected: {} sats",
                record.payment_request_id, json["expected_sats"]
            );
            let report = sdk.process_outbound_private_messages(peer.clone()).await?;
            println!("Delivery: {:?}", report);
            let persisted = sdk
                .payment_requests_with(peer)
                .await?
                .into_iter()
                .find(|r| r.payment_request_id == record.payment_request_id)
                .context("request missing after delivery")?;
            if persisted.proposal_outbound_status != Some(FfiOutboundPrivateMessageStatus::Sent) {
                bail!(
                    "request is queued but not delivered; use poll to retry this request, not send"
                );
            }
        }
        Command::Poll { seconds } => {
            let end = tokio::time::Instant::now() + Duration::from_secs(seconds);
            loop {
                sdk.receive_private_messages_from_linked_peers().await?;
                let reports = sdk.process_pending_private_messages().await?;
                println!("Delivery: {:?}", reports);
                if tokio::time::Instant::now() >= end {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
        Command::Status => {
            println!("Links: {:?}", sdk.linked_peers().await?);
            for record in sdk.payment_requests().await? {
                println!(
                    "Request {}: {:?}, delivery {:?}",
                    record.payment_request_id, record.state, record.proposal_outbound_status
                );
                println!("Proof count: {}", record.payment_proofs.len());
                for proof in &record.payment_proofs {
                    println!("Proof: {:?}; data: {}", proof, proof.proof.export_text());
                }
            }
        }
        Command::Init { .. } | Command::Preview { .. } => unreachable!(),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn address() -> String {
        use bitcoin::{
            secp256k1::{Secp256k1, SecretKey},
            CompressedPublicKey,
        };
        let secp = Secp256k1::new();
        let public = bitcoin::secp256k1::PublicKey::from_secret_key(
            &secp,
            &SecretKey::from_slice(&[1; 32]).unwrap(),
        );
        bitcoin::Address::p2wpkh(&CompressedPublicKey(public), bitcoin::Network::Regtest)
            .to_string()
    }
    #[test]
    fn presets_validate_against_real_rc71_protocol() {
        for (preset, asset, amount, sats) in [
            (Preset::Usd, "usd", "10", 21000),
            (Preset::Btc, "btc", "0.001", 50000),
        ] {
            let (ffi, json) = terms(preset, &address()).unwrap();
            let native: paykit_lib::PaymentRequestTerms = ffi.try_into().unwrap();
            assert_eq!(native.amount().asset(), asset);
            assert_eq!(native.amount().value(), amount);
            assert!(matches!(
                native.conversion(),
                Some(paykit_lib::PaymentConversion::Fixed { .. })
            ));
            assert_eq!(json["expected_sats"], sats);
            assert!(json["payment_endpoints"].get(ENDPOINT).is_some());
        }
        println!("Test-only regtest address: {}", address());
    }
    #[test]
    fn refuses_placeholder_and_foreign_addresses() {
        assert!(terms(Preset::Usd, "bcrt1qissuerfixture").is_err());
        let checked: bitcoin::Address = address()
            .parse::<bitcoin::Address<bitcoin::address::NetworkUnchecked>>()
            .unwrap()
            .require_network(bitcoin::Network::Regtest)
            .unwrap();
        let foreign =
            bitcoin::Address::from_script(&checked.script_pubkey(), bitcoin::Network::Bitcoin)
                .unwrap()
                .to_string();
        assert!(terms(Preset::Usd, &foreign).is_err());
    }
    #[test]
    fn custom_rates_replace_presets_and_preserve_terms() {
        let mut options = RequestOptions {
            address: address(),
            asset: Some("usdt".into()),
            amount: Some("5.00".into()),
            rates: vec!["btc=0.00003".into()],
            note: Some("Custom QA".into()),
            expires_in: 3600,
        };
        let (terms, json) = custom_terms(Some(Preset::Btc), &options).unwrap();
        let native: paykit_lib::PaymentRequestTerms = terms.try_into().unwrap();
        assert_eq!(native.amount().value(), "5.00");
        assert_eq!(native.amount().asset(), "usdt");
        assert_eq!(json["expected_sats"], 15000);
        assert_eq!(json["metadata"]["note"], "Custom QA");
        assert_eq!(json["conversion"]["rates"].as_array().unwrap().len(), 1);
        options.rates.push("btc-regtest=0.00002".into());
        assert_eq!(
            custom_terms(None, &options).unwrap().1["expected_sats"],
            10000
        );
        for rates in [vec!["bad"], vec!["btc=0"], vec!["btc=1", "btc=2"]] {
            options.rates = rates.into_iter().map(String::from).collect();
            assert!(custom_terms(None, &options).is_err());
        }
        options.asset = Some("btc".into());
        options.amount = Some("0.0001".into());
        options.rates.clear();
        let (terms, json) = custom_terms(None, &options).unwrap();
        assert!(terms.conversion.is_none());
        assert!(json.get("conversion").is_none());
        assert_eq!(json["expected_sats"], 10000);
    }
    #[test]
    fn preview_estimate_rounds_up_and_handles_overflow() {
        assert_eq!(estimate_sats("0.05", "0.000012345"), Some(62));
        assert_eq!(estimate_sats("10", "0.000021"), Some(21000));
        assert_eq!(
            estimate_sats("99999999999999999999999999999999999999999", "2"),
            None
        );
        assert_eq!(estimate_sats("184467440737.09551616", "1"), None);
    }
    #[test]
    fn durable_blob_store_rejects_stale_revision_after_restart() {
        let dir = std::env::temp_dir().join(format!(
            "paykit-fixture-test-{:032x}",
            rand::random::<u128>()
        ));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("sdk.bin");
        // The SDK validates blob contents; use its real empty-state encoding.
        let bytes = paykit_sdk_empty_state();
        let first = Store(path.clone())
            .save_state_blob_atomically(Arc::new(FfiSdkStateBlob::new(bytes.clone())), None)
            .unwrap();
        let restarted = Store(path);
        assert_eq!(
            restarted.load_state_blob().unwrap().unwrap().revision,
            first
        );
        assert!(matches!(
            restarted
                .save_state_blob_atomically(Arc::new(FfiSdkStateBlob::new(bytes.clone())), None),
            Err(PaykitFfiError::ConcurrentUpdate { .. })
        ));
        let second = restarted
            .save_state_blob_atomically(Arc::new(FfiSdkStateBlob::new(bytes)), Some(first.clone()))
            .unwrap();
        assert_ne!(first, second);
        fs::remove_dir_all(dir).unwrap();
    }
    fn paykit_sdk_empty_state() -> Vec<u8> {
        paykit_sdk::storage::encode_storage_state_blob(&paykit_sdk::storage::StorageState::default()).unwrap()
    }
}
