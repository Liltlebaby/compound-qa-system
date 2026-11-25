import { useMemo } from 'react';
import { posterSvg } from './poster-model.mjs';

interface PosterData {
  [key: string]: any;
}
export default function QRPoster({ poster }: { poster: PosterData }) {
  const markup = useMemo(() => posterSvg(poster), [poster]);
  return <div className="qr-poster-art" dangerouslySetInnerHTML={{ __html: markup }} />;
}
