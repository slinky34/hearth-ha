import AVFoundation
import CoreVideo

// 10-second, 16x16 black H.264 video at 1 fps with a silent AAC audio track.
// Safari only keeps the screen on for a playing video that has sound, isn't muted and isn't
// set to loop, so the audio track matters (Hearth jumps back to the start itself).
// Usage: swift scripts/make-keepawake.swift public/keepawake.mp4
let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.removeItem(at: out)
let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
let seconds = 10

let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 16, AVVideoHeightKey: 16,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 2000, AVVideoProfileLevelKey: AVVideoProfileLevelH264BaselineAutoLevel],
])
video.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 16, kCVPixelBufferHeightKey as String: 16,
])
let rate = 22050.0
let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 16000,
])
audio.expectsMediaDataInRealTime = false
writer.add(video)
writer.add(audio)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

var asbd = AudioStreamBasicDescription(mSampleRate: rate, mFormatID: kAudioFormatLinearPCM,
  mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked, mBytesPerPacket: 2,
  mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
var fmt: CMAudioFormatDescription?
CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &fmt)

func silence(at frame: Int, count: Int) -> CMSampleBuffer {
  let bytes = count * 2
  var block: CMBlockBuffer?
  CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: bytes, blockAllocator: nil,
    customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block)
  CMBlockBufferFillDataBytes(with: 0, blockBuffer: block!, offsetIntoDestination: 0, dataLength: bytes)
  var sb: CMSampleBuffer?
  CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block!, formatDescription: fmt!,
    sampleCount: count, presentationTimeStamp: CMTime(value: CMTimeValue(frame), timescale: CMTimeScale(rate)),
    packetDescriptions: nil, sampleBufferOut: &sb)
  return sb!
}

let group = DispatchGroup()
var frame = 0
group.enter()
video.requestMediaDataWhenReady(on: DispatchQueue(label: "v")) {
  while video.isReadyForMoreMediaData {
    if frame > seconds { video.markAsFinished(); group.leave(); return }
    var pb: CVPixelBuffer?
    CVPixelBufferCreate(nil, 16, 16, kCVPixelFormatType_32ARGB, nil, &pb)
    CVPixelBufferLockBaseAddress(pb!, [])
    memset(CVPixelBufferGetBaseAddress(pb!), 0, CVPixelBufferGetDataSize(pb!))
    CVPixelBufferUnlockBaseAddress(pb!, [])
    adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 1))
    frame += 1
  }
}
var sample = 0
let total = Int(rate) * seconds
group.enter()
audio.requestMediaDataWhenReady(on: DispatchQueue(label: "a")) {
  while audio.isReadyForMoreMediaData {
    if sample >= total { audio.markAsFinished(); group.leave(); return }
    let n = min(4096, total - sample)
    audio.append(silence(at: sample, count: n))
    sample += n
  }
}
group.wait()
let done = DispatchSemaphore(value: 0)
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(seconds), timescale: 1))
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "ok" : "failed: \(String(describing: writer.error))")
