#!/usr/bin/env bash
set -euo pipefail

# One-off setup of Workload Identity Federation so a GitHub Actions workflow can
# provision and delete regtest VMs without a long-lived service-account key.
#
# Run once per (GCP project, GitHub repo) pair. Safe to re-run: every create is
# guarded by a lookup.
#
#   PROJECT_ID=your-gcp-project REPO=owner/name ./setup-wif.sh
#
# Prints the three values the workflows expect at the end.

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REPO="${REPO:?set REPO as owner/name}"

POOL="${POOL:-github-actions}"
PROVIDER="${PROVIDER:-github}"
SA_NAME="${SA_NAME:-regtest-ci}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

log() { echo "[setup-wif] $*"; }
exists() { "$@" >/dev/null 2>&1; }

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
log "project $PROJECT_ID ($PROJECT_NUMBER), repo $REPO"

log "enabling APIs"
gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  compute.googleapis.com \
  --project="$PROJECT_ID"

if ! exists gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID"; then
  log "creating service account $SA_NAME"
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name="Ephemeral regtest VM lifecycle for CI"
fi

log "granting roles"
# instanceAdmin: create/delete VMs. securityAdmin: the per-run firewall rule.
# Both are broader than strictly needed — a custom role limited to
# compute.instances.* and compute.firewalls.* is worth doing for a shared project.
for role in roles/compute.instanceAdmin.v1 roles/compute.securityAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" --condition=None >/dev/null
done

# Creating an instance that runs as the default compute SA requires actAs on it.
# The VM itself needs no GCP access, so --no-service-account on the instance would
# remove this binding — worth doing if the project is ever shared.
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/iam.serviceAccountUser >/dev/null

if ! exists gcloud iam workload-identity-pools describe "$POOL" \
  --project="$PROJECT_ID" --location=global; then
  log "creating workload identity pool $POOL"
  gcloud iam workload-identity-pools create "$POOL" \
    --project="$PROJECT_ID" --location=global \
    --display-name="GitHub Actions"
fi

if ! exists gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL"; then
  log "creating OIDC provider $PROVIDER"
  # The attribute-condition is the security boundary. Without it ANY GitHub repo
  # in the world could mint tokens for this pool.
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository=='${REPO}'"
fi

log "binding $REPO to $SA_EMAIL"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

cat <<EOF

Done. Configure the repository with:

  Variable  REGTEST_GCP_PROJECT       ${PROJECT_ID}
  Secret    REGTEST_SERVICE_ACCOUNT   ${SA_EMAIL}
  Secret    REGTEST_WIF_PROVIDER      projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}

  gh variable set REGTEST_GCP_PROJECT     --repo ${REPO} --body '${PROJECT_ID}'
  gh secret   set REGTEST_SERVICE_ACCOUNT --repo ${REPO} --body '${SA_EMAIL}'
  gh secret   set REGTEST_WIF_PROVIDER    --repo ${REPO} \\
      --body 'projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}'

Only ${REPO} can use this provider — rerun with a different REPO to authorise another.
EOF
