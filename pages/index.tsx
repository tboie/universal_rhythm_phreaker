import Head from "next/head";
import Image from "next/image";
import styles from "@/styles/Home.module.css";
import { promises as fs } from "fs";
import path from "path";
import { useEffect, useState } from "react";
//@ts-ignore
import util from "audio-buffer-utils";
//@ts-ignore
import toWav from "audiobuffer-to-wav";

let wavesurfer: any;
let init = false;
let times: number[] = [];
let audio: AudioBuffer;
let finalAudio: AudioBuffer;
let wav: any;
let blob: Blob;
let blobUrl = "";

export default function Home(props: any) {
  const [selectedFile, setSelectedFile] = useState("");
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const initWaveSurfer = async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      const regions =
        //@ts-ignore
        (await import("wavesurfer.js/dist/plugin/wavesurfer.regions")).default;
      const markers =
        //@ts-ignore
        (await import("wavesurfer.js/dist/plugin/wavesurfer.markers")).default;

      wavesurfer = WaveSurfer.create({
        container: "#waveform",
        height: 200,
        waveColor: "#39FF14",
        progressColor: "#39FF14",
        plugins: [
          regions.create({
            regionsMinLength: 0.1,
            regions: [],
          }),
          markers.create({
            markers: [],
          }),
        ],
      });

      wavesurfer.on("ready", function () {
        times.push(wavesurfer.getDuration());

        wavesurfer.addRegion({
          start: 0,
          end: wavesurfer.getDuration(),
          loop: true,
          color: "rgba(255, 255, 255, 0.15)",
        });

        times.forEach((t) => {
          wavesurfer.addMarker({ time: t });
        });

        finalAudio = wavesurfer.backend.buffer;

        setLoading(false);
      });
    };

    if (!init) {
      init = true;
      initWaveSurfer();
      window.addEventListener("resize", (event) => {
        wavesurfer.drawer.fireEvent("redraw");
      });
    }
  }, []);

  const resetWaveSurfer = () => {
    wavesurfer.stop();
    wavesurfer.clearMarkers();
    wavesurfer.clearRegions();
    wavesurfer.setPlaybackRate(1);
    wavesurfer.zoom(0);
    wavesurfer.empty();

    setSpeed(1);
    setZoom(0);
    setPlaying(false);
  };

  const listClick = async (folder: string) => {
    resetWaveSurfer();

    setSelectedFile(folder);
    setLoading(true);

    await fetch(`/drums/${folder}/times.txt`)
      .then((response) => response.text())
      .then((text) => {
        times = text
          .split("\n")
          .filter((t) => t)
          .map((t) => parseFloat(t));

        wavesurfer.load(`/drums/${folder}/audio.wav`);
      });
  };

  const originalClick = () => {
    listClick(selectedFile);
  };

  const randomClick = () => {
    function arrShuffle(a: any[]) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    setLoading(true);

    audio = util.create();
    finalAudio = util.create();
    audio = wavesurfer.backend.buffer;

    const buffers = times
      .map((t, idx) => {
        if (idx < times.length - 1) {
          return {
            buffer: util.slice(
              audio,
              audio.sampleRate * t,
              audio.sampleRate * times[idx + 1]
            ),
            duration: times[idx + 1] - t,
          };
        }
      })
      .filter((b) => b);

    const shuffled = arrShuffle(buffers);
    shuffled.forEach((b) => {
      finalAudio = util.concat(finalAudio, b.buffer);
    });

    let durTotal = 0;
    times = shuffled.map((obj) => {
      durTotal += obj.duration;
      return parseFloat(durTotal.toFixed(6));
    });
    times.unshift(0);
    times.pop();

    wav = toWav(finalAudio);
    blob = new window.Blob([new DataView(wav)], {
      type: "audio/wav",
    });

    resetWaveSurfer();
    wavesurfer.loadBlob(blob);
  };

  const downloadClick = () => {
    const anchor = document.createElement("a");
    wav = toWav(finalAudio);
    blob = new window.Blob([new DataView(wav)], {
      type: "audio/wav",
    });
    blobUrl = window.URL.createObjectURL(blob);
    anchor.href = blobUrl;
    anchor.download = "audio.wav";
    anchor.click();
    window.URL.revokeObjectURL(blobUrl);
  };

  const playStopClick = () => {
    if (playing) {
      wavesurfer.stop();
    } else {
      (Object.values(wavesurfer.regions.list)[0] as any).playLoop();
    }
    setPlaying(!playing);
  };

  const moveRegion = (pos: "start" | "end", dir: "left" | "right") => {
    const closest = (array: number[], goal: number) =>
      array.reduce((prev, curr) =>
        Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev
      );

    const region = Object.values(wavesurfer.regions.list)[0] as any;
    const handle = pos === "start" ? region.start : region.end;
    const result = closest(times, handle);
    let newPos = handle;

    if (dir === "left") {
      if (handle <= result) {
        if (handle > times[1]) {
          newPos = times[times.findIndex((t) => t === result) - 1];
        } else {
          if (pos === "start") {
            newPos = 0;
          }
        }
      } else {
        newPos = result;
      }
    } else if (dir === "right") {
      if (handle >= result) {
        if (handle < times[times.length - 2]) {
          newPos = times[times.findIndex((t) => t === result) + 1];
        } else {
          if (pos === "end") {
            newPos = wavesurfer.getDuration();
          }
        }
      } else {
        newPos = result;
      }
    }

    if (
      (pos === "start" && newPos < region.end) ||
      (pos === "end" && newPos > region.start)
    ) {
      region.update({
        start: pos === "start" ? newPos : region.start,
        end: pos === "end" ? newPos : region.end,
      });
    }
  };

  return (
    <>
      <Head>
        <title>Universal BreakBeat Phreaker</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <span className={styles.title}>Universal BreakBeat Phreaker</span>

        <div id="waveform" className={styles.waveform} />

        <div className={styles.controls}>
          <button
            onClick={() => moveRegion("start", "left")}
            disabled={loading}
          >
            {"<"}
          </button>
          <button
            onClick={() => moveRegion("start", "right")}
            disabled={loading}
          >
            {">"}
          </button>
          <span className={styles.info}>{speed + "x"}</span>
          <button onClick={() => moveRegion("end", "left")} disabled={loading}>
            {"<"}
          </button>
          <button onClick={() => moveRegion("end", "right")} disabled={loading}>
            {">"}
          </button>
        </div>

        <input
          type="range"
          min="0.05"
          max="2"
          value={speed}
          step="0.05"
          className={styles.slider}
          onInput={(e: any) => {
            const speed = e.target.value as number;
            wavesurfer.setPlaybackRate(speed);
            setSpeed(speed);
          }}
          disabled={loading}
        />

        <input
          id="zoom"
          type="range"
          step={25}
          min={0}
          max={800}
          value={zoom}
          className={styles.slider}
          onInput={(e: any) => {
            const zoom = e.target.value as number;
            wavesurfer.zoom(zoom);
            setZoom(zoom);
          }}
          disabled={loading}
        />

        <div className={styles.toolbar}>
          <button onClick={originalClick} disabled={loading}>
            Original
          </button>

          <button disabled={loading} onClick={playStopClick}>
            {playing ? "Stop" : "Play"}
          </button>

          <button onClick={randomClick} disabled={loading}>
            <Image
              src={loading ? "dice_disabled.svg" : "dice.svg"}
              alt="dice"
              width={24}
              height={24}
            />
          </button>

          <button id="download" onClick={downloadClick} disabled={loading}>
            Download
          </button>
        </div>

        <ul className={styles.playlist}>
          {props.folders.map((folder: string) => {
            return (
              <li
                className={folder === selectedFile ? styles.selected : ""}
                key={folder}
                onClick={() => listClick(folder)}
              >
                {folder}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}

export async function getStaticProps() {
  const drumsDir = path.join(process.cwd(), "public/drums");
  const folders = await fs.readdir(drumsDir);

  return {
    props: {
      folders: await Promise.all(folders),
    },
  };
}
