import { GuitarProEmbed } from "@/components/content/guitar-pro-embed";
import { isAudioFile, isGuitarProFile, isVideoFile } from "../media.utils";

export function FilePreview({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) {
  if (isGuitarProFile(fileName))
    return <GuitarProEmbed src={url} fileName={fileName} />;
  if (isAudioFile(fileName))
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        className="w-full"
        aria-label={fileName}
      />
    );
  if (isVideoFile(fileName))
    return (
      <video
        controls
        preload="metadata"
        src={url}
        className="w-full max-h-96"
        aria-label={fileName}
      />
    );
  return <img src={url} alt={fileName} />;
}
