import AVFoundation
import CoreVideo

// 2-second, 16x16 black H.264 video at 2 fps: the smallest thing iOS treats as "video playing".
let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.removeItem(at: out)
let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 16, AVVideoHeightKey: 16,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 2000, AVVideoProfileLevelKey: AVVideoProfileLevelH264BaselineAutoLevel]]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 16, kCVPixelBufferHeightKey as String: 16])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for i in 0..<5 {
  var pb: CVPixelBuffer?
  CVPixelBufferCreate(nil, 16, 16, kCVPixelFormatType_32ARGB, nil, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  memset(CVPixelBufferGetBaseAddress(pb!), 0, CVPixelBufferGetDataSize(pb!))
  CVPixelBufferUnlockBaseAddress(pb!, [])
  while !input.isReadyForMoreMediaData { usleep(1000) }
  adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 2))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.endSession(atSourceTime: CMTime(value: 4, timescale: 2))
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "ok" : "failed: \(String(describing: writer.error))")
