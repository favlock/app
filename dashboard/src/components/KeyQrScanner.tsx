import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Text } from "./ui/text";

type QrDecoder = typeof import("jsqr").default;

interface KeyQrScannerProps {
  active: boolean;
  onScan: (value: string) => void;
}

export default function KeyQrScanner({ active, onScan }: KeyQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let decodeQr: QrDecoder | null = null;

    const stopCamera = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const scanFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });

      if (
        !cancelled &&
        video &&
        canvas &&
        context &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = decodeQr?.(
          imageData.data,
          imageData.width,
          imageData.height,
        );

        if (result?.data) {
          onScan(result.data);
          stopCamera();
          return;
        }
      }

      if (!cancelled) {
        frameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    const startCamera = async () => {
      setError(null);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera scanning is not available in this browser.");
        }

        const [{ default: qrDecoder }, stream] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          }),
        ]);
        decodeQr = qrDecoder;

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        scanFrame();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not start the camera. Upload the key file instead.",
        );
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [active, onScan]);

  if (!active) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-950/10 bg-zinc-50  ">
      <div className="relative aspect-video bg-zinc-950">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label="Camera preview for encryption key QR scanner"
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-44 w-44 max-w-[70%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-start gap-2 px-4 py-3">
        <Camera
          className="mt-0.5 size-4 shrink-0 text-zinc-500 "
          aria-hidden="true"
        />
        <Text
          className="text-sm text-zinc-600! "
          role={error ? "alert" : "status"}
          aria-live="polite"
        >
          {error ?? "Point your camera at the transfer QR shown on your laptop."}
        </Text>
      </div>
    </div>
  );
}
