import AVFoundation
import AppKit

guard CommandLine.arguments.count == 4 else {
  fputs("usage: extract-video-frame <input> <seconds> <output>\n", stderr)
  exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let seconds = Double(CommandLine.arguments[2]) ?? 0
let output = URL(fileURLWithPath: CommandLine.arguments[3])
let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let image = try generator.copyCGImage(
  at: CMTime(seconds: seconds, preferredTimescale: 600),
  actualTime: nil
)
let bitmap = NSBitmapImageRep(cgImage: image)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  throw NSError(domain: "extract-video-frame", code: 1)
}
try png.write(to: output)
