import UIKit

// A URL keyboard with no Done button or submit handler. The bottom control
// is covered until the keyboard is hidden; no wallet or network is involved.
final class FixtureController: UIViewController {
    let field = UITextField()
    let save = UIButton(type: .system)
    let status = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        field.borderStyle = .roundedRect
        field.keyboardType = .URL
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.text = "fixture-proof"
        field.accessibilityIdentifier = "FixtureField"
        field.placeholder = "Fixture input"
        save.setTitle("Save fixture", for: .normal)
        save.accessibilityIdentifier = "FixtureSave"
        save.addTarget(self, action: #selector(saved), for: .touchUpInside)
        status.text = "Not saved"
        status.accessibilityIdentifier = "FixtureStatus"
        [field, save, status].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview($0)
        }
        NSLayoutConstraint.activate([
            field.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
            field.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            field.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            field.heightAnchor.constraint(equalToConstant: 48),
            status.topAnchor.constraint(equalTo: field.bottomAnchor, constant: 24),
            status.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            save.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            save.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            save.heightAnchor.constraint(equalToConstant: 48),
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardShown), name: UIResponder.keyboardDidShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardHidden), name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        field.becomeFirstResponder()
    }

    @objc func keyboardShown() { status.text = "Keyboard visible" }
    @objc func keyboardHidden() { status.text = "Keyboard hidden" }
    @objc func saved() { status.text = "Saved: \(field.text ?? "")" }
}

final class FixtureScene: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: scene)
        window?.rootViewController = FixtureController()
        window?.makeKeyAndVisible()
    }
}

final class FixtureDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Fixture", sessionRole: session.role)
        configuration.delegateClass = FixtureScene.self
        return configuration
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(FixtureDelegate.self))
