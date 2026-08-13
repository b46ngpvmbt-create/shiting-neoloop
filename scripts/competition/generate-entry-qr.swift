import AppKit
import CoreImage
import Foundation

guard CommandLine.arguments.count == 3 else {
  fputs("usage: generate-entry-qr <url> <output.png>\n", stderr)
  exit(2)
}

let url = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let context = CIContext()
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(Data(url.utf8), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")

guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
      let cgImage = context.createCGImage(image, from: image.extent) else {
  fputs("failed to generate QR image\n", stderr)
  exit(1)
}

let bitmap = NSBitmapImageRep(cgImage: cgImage)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fputs("failed to encode QR image\n", stderr)
  exit(1)
}

try png.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
