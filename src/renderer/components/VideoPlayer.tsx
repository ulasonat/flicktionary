import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';

interface VideoPlayerProps {
  videoUrl: string;
  subtitleUrl: string;
  beginTimestamp: string;
  endTimestamp: string;
  videoFileName?: string;
  audioUrl?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  subtitleUrl,
  beginTimestamp,
  endTimestamp,
  videoFileName = '',
  audioUrl
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Convert timestamp to seconds
  const timestampToSeconds = (timestamp: string): number => {
    const [time, ms] = timestamp.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + (ms ? parseInt(ms) / 1000 : 0);
  };

  // Get MIME type based on file extension
  const getMimeType = (fileName: string): string => {
    const extension = fileName.toLowerCase().split('.').pop();
    const mimeTypes: { [key: string]: string } = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/webm', // Use video/webm for better browser compatibility
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'm4v': 'video/mp4',
      'ogv': 'video/ogg'
    };
    
    return mimeTypes[extension || ''] || 'video/mp4';
  };

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    // Initialize video.js player
    const player = videojs(videoRef.current, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      fluid: true,
      playbackRates: [0.5, 1, 1.5, 2],
      // Enhanced options for better .mkv support
      html5: {
        vhs: {
          overrideNative: true
        }
      }
    });

    playerRef.current = player;

    const audio = audioRef.current;
    if (audioUrl && audio) {
      audio.src = audioUrl;
      audio.currentTime = Math.max(0, timestampToSeconds(beginTimestamp) - 2);
    }

    // Set up video segment
    const startTime = Math.max(0, timestampToSeconds(beginTimestamp) - 2);
    const endTime = timestampToSeconds(endTimestamp) + 2;

    player.ready(() => {
      player.currentTime(startTime);
      if (audioUrl && audio) {
        audio.currentTime = startTime;
        audio.play();
        player.muted(true);
      }
      player.play();

      const tracks = player.textTracks();
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'showing';
      }
      
      const sync = () => {
        const currentTime = player.currentTime();
        if (currentTime && currentTime >= endTime) {
          player.pause();
          player.currentTime(startTime);
          if (audioUrl && audio) {
            audio.pause();
            audio.currentTime = startTime;
          }
        }
        if (audioUrl && audio && Math.abs(audio.currentTime - currentTime) > 0.3) {
          audio.currentTime = currentTime;
        }
      };
      player.on('timeupdate', sync);
      player.on('seeking', sync);
      player.on('play', () => {
        if (audioUrl && audio) audio.play();
      });
      player.on('pause', () => {
        if (audioUrl && audio) audio.pause();
      });
      
    });

    return () => {
      const currentPlayer = playerRef.current;
      if (currentPlayer && !currentPlayer.isDisposed()) {
        currentPlayer.dispose();
        playerRef.current = null;
      }
    };
  }, [videoUrl, beginTimestamp, endTimestamp, videoFileName, audioUrl]);

  const mimeType = getMimeType(videoFileName);

  return (
    <div className="video-player-wrapper">
      <video
        ref={videoRef}
        className="video-js vjs-default-skin vjs-big-play-centered"
        playsInline
        muted={!!audioUrl}
      >
        <source src={videoUrl} type={mimeType} />
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srclang="en"
            label="English"
            default
          />
        )}
      </video>
      {audioUrl && <audio ref={audioRef} hidden />}
    </div>
  );
};

export default VideoPlayer;
