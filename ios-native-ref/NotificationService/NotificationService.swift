// ios/NotificationService/NotificationService.swift
//
// Notification Service Extension. Runs for any push that includes
// `mutable-content: 1` in the aps payload (which all our call & gift pushes
// do). Used to:
//   • Download the caller avatar and attach it to the notification so it
//     shows on the lockscreen / banner instead of the generic app icon.
//   • Optionally rewrite the title / body if the payload was minimal.
//
// IMPORTANT: This extension does NOT handle VoIP pushes — those go straight
// to PushKit in the main app. This only enriches normal alert pushes.

import UserNotifications

final class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let content = bestAttemptContent else {
            contentHandler(request.content); return
        }

        let userInfo = content.userInfo
        let avatarUrl = (userInfo["caller_avatar"] as? String)
            ?? (userInfo["avatar_url"] as? String)
            ?? ""

        guard let url = URL(string: avatarUrl), !avatarUrl.isEmpty else {
            contentHandler(content); return
        }

        downloadAttachment(from: url) { attachment in
            if let attachment = attachment {
                content.attachments = [attachment]
            }
            contentHandler(content)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // Apple gives us ~30s. If we run out, deliver whatever we've built so far.
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }

    private func downloadAttachment(from url: URL,
                                    completion: @escaping (UNNotificationAttachment?) -> Void) {
        URLSession.shared.downloadTask(with: url) { tempUrl, response, _ in
            guard let tempUrl = tempUrl else { completion(nil); return }
            let ext = (response?.suggestedFilename as NSString?)?.pathExtension ?? "jpg"
            let target = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(UUID().uuidString + "." + ext)
            do {
                try FileManager.default.moveItem(at: tempUrl, to: target)
                let attachment = try UNNotificationAttachment(identifier: "avatar",
                                                              url: target,
                                                              options: nil)
                completion(attachment)
            } catch {
                completion(nil)
            }
        }.resume()
    }
}
