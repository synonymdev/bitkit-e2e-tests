import Foundation
import Vision
import ImageIO

// Normalized, top-left coordinates work with both @2x and @3x screenshots.
do {
    guard CommandLine.arguments.count == 2 else {
        throw NSError(domain: "recognize", code: 1, userInfo: [NSLocalizedDescriptionKey: "usage: recognize screenshot.png"])
    }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw NSError(domain: "recognize", code: 2, userInfo: [NSLocalizedDescriptionKey: "cannot read screenshot"])
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let text = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": text.string, "confidence": text.confidence,
                "x": box.midX, "y": 1 - box.midY,
                "left": box.minX, "top": 1 - box.maxY,
                "width": box.width, "height": box.height]
    }
    let result: [String: Any] = ["width": image.width, "height": image.height, "lines": lines]
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
