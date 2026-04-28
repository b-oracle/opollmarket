// ios/App/App/AppDelegate.swift — merge these additions into your existing AppDelegate.
//
// 1) Add the imports.
// 2) Hold strong references to the PushKit handler and CallKit provider on the AppDelegate.
// 3) Bootstrap them inside `application(_:didFinishLaunchingWithOptions:)`.
// 4) Forward universal links / custom-scheme opens to Capacitor.

import UIKit
import Capacitor
import PushKit
import CallKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // STRONG references — losing these means PushKit/CallKit silently stop working.
    var voipHandler: VoipPushHandler!
    var callProvider: CallProviderDelegate!

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {

        // CallKit provider must be created BEFORE the first VoIP push, because
        // PushKit gives us only ~5 seconds to call reportNewIncomingCall.
        callProvider = CallProviderDelegate()
        voipHandler  = VoipPushHandler(callProvider: callProvider)
        voipHandler.register()

        return true
    }

    // Capacitor URL handling — required so opoll:// deep links reach the
    // existing JS App listener that routes to /messages/<id>?call_id=…
    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
                                                           continue: userActivity,
                                                           restorationHandler: restorationHandler)
    }

    // Standard APNs token (alerts / missed-call notifications) — keep your
    // existing handler; this is what the Capacitor PushNotifications plugin
    // forwards to your `useNativePush` registration flow.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}
