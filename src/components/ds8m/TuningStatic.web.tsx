import { useEffect, useRef, type CSSProperties } from 'react';
import { StyleSheet, View } from 'react-native';
import { TuningOverlay } from './TuningOverlay';

const TONAL_FLOOR = 36;
const TONAL_RANGE = 183;
const MAX_DPR = 2;
const BUFFER_SCALE = 1.5;

function nextXorshift(value: number): number {
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function makeNoiseBuffer(width: number, height: number): HTMLCanvasElement {
  const buffer = document.createElement('canvas');
  buffer.width = Math.ceil(width * BUFFER_SCALE);
  buffer.height = Math.ceil(height * BUFFER_SCALE);

  const context = buffer.getContext('2d');
  if (!context) return buffer;

  const image = context.createImageData(buffer.width, buffer.height);
  const pixels = new Uint32Array(image.data.buffer);
  let random = (Date.now() ^ (width << 16) ^ height) >>> 0 || 0x6d2b79f5;
  for (let index = 0; index < pixels.length; index += 1) {
    random = nextXorshift(random);
    const gray = TONAL_FLOOR + (random % TONAL_RANGE);
    pixels[index] = (0xff000000 | (gray << 16) | (gray << 8) | gray) >>> 0;
  }
  context.putImageData(image, 0, 0);
  return buffer;
}

function WebStatic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    context.imageSmoothingEnabled = false;
    let frame = 0;
    let noise: HTMLCanvasElement | null = null;
    let fillWidth = 0;
    let fillHeight = 0;
    let random = (Date.now() ^ 0xa5a5a5a5) >>> 0;

    const resize = (cssWidth: number, cssHeight: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.ceil(cssWidth * dpr));
      const height = Math.max(1, Math.ceil(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.imageSmoothingEnabled = false;
      }

      const significant = Math.abs(width - fillWidth) > Math.max(64, fillWidth * 0.1)
        || Math.abs(height - fillHeight) > Math.max(64, fillHeight * 0.1);
      if (!noise || width > noise.width || height > noise.height || significant) {
        noise = makeNoiseBuffer(width, height);
        fillWidth = width;
        fillHeight = height;
      }
    };

    const bounds = canvas.getBoundingClientRect();
    resize(bounds.width, bounds.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);

    const draw = () => {
      if (noise) {
        random = nextXorshift(random);
        const maxX = noise.width - canvas.width;
        const sourceX = maxX > 0 ? random % (maxX + 1) : 0;
        random = nextXorshift(random);
        const maxY = noise.height - canvas.height;
        const sourceY = maxY > 0 ? random % (maxY + 1) : 0;
        context.drawImage(
          noise,
          sourceX,
          sourceY,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  imageRendering: 'pixelated',
};

interface TuningStaticProps {
  error?: string | null;
}

/** The broken signal between detents. It is information, so reduced motion keeps it. */
export function TuningStatic({ error }: TuningStaticProps) {
  return (
    <View style={styles.static} pointerEvents="none">
      <WebStatic />

      <TuningOverlay error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  static: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#777',
  },
});
