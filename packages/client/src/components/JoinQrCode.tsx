import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  roomCode: string;
}

/**
 * A QR code for the room's join link (spec §4).
 *
 * It encodes a URL rather than the bare code so a phone's built-in camera
 * opens the app with the room already filled in -- no in-app scanner needed,
 * which is how people actually scan these.
 */
export function JoinQrCode({ roomCode }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const joinUrl = `${window.location.origin}/?room=${roomCode}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(joinUrl, {
      type: "svg",
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  if (!svg) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-40 h-40 bg-white rounded-xl p-2"
        // qrcode renders a self-contained <svg>; there is no user input in it
        // beyond the room code, which the server generated from a fixed
        // alphabet.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-slate-500 text-xs">Scan to join</p>
    </div>
  );
}
