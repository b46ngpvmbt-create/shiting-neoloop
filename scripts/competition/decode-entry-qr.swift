import AppKit
import CoreImage
import Foundation

guard CommandLine.arguments.count == 2,
      let image = CIImage(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])) else {
  fputs("usage: decode-entry-qr <image.png>\n", stderr)
  exit(2)
}

let detector = CIDetector(
  ofType: CIDetectorTypeQRCode,
  context: CIContext(),
  options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
)

let messages = detector?.features(in: image).compactMap { feature in
  (feature as? CIQRCodeFeature)?.messageString
} ?? []

guard !messages.isEmpty else {
  fputs("no QR payload found\n", stderr)
  exit(1)
}

for message in messages {
  print(message)
}
