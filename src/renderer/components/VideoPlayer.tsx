import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';

interface VideoPlayerProps {
  videoUrl: string;
  subtitleUrl: string;
  beginTimestamp: string;
  endTimestamp: string;
  videoFileName?: string;
  /** Optional external audio element to sync with the video */
  externalAudio?: HTMLAudioElement | null;
  /** Show audio conversion button */
  showAudioButton?: boolean;
  /** Callback when user requests audio generation */
  onRequestAudio?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  subtitleUrl,
  beginTimestamp,
  endTimestamp,
  videoFileName = '',
  externalAudio,
  showAudioButton,
  onRequestAudio
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);

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

    if (externalAudio) {
      // Mute original video audio when external audio is provided
      player.muted(true);
    }

    // Set up video segment
    const startTime = Math.max(0, timestampToSeconds(beginTimestamp) - 2);
    const endTime = timestampToSeconds(endTimestamp) + 2;

    player.ready(() => {
      player.currentTime(startTime);
      player.play();

      const tracks = player.textTracks();
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'showing';
      }
      
      player.on('timeupdate', () => {
        const currentTime = player.currentTime();
        if (externalAudio && Math.abs(externalAudio.currentTime - currentTime) > 0.3) {
          externalAudio.currentTime = currentTime;
        }
        if (currentTime && currentTime >= endTime) {
          player.pause();
          player.currentTime(startTime);
          if (externalAudio) {
            externalAudio.pause();
            externalAudio.currentTime = startTime;
          }
        }
      });

      if (externalAudio) {
        externalAudio.currentTime = startTime;
        externalAudio.play();
        player.on('play', () => externalAudio.play());
        player.on('pause', () => externalAudio.pause());
        player.on('seeked', () => {
          externalAudio.currentTime = player.currentTime();
        });
      }
    });

    return () => {
      const currentPlayer = playerRef.current;
      if (currentPlayer && !currentPlayer.isDisposed()) {
        currentPlayer.dispose();
        playerRef.current = null;
      }
    };
  }, [videoUrl, beginTimestamp, endTimestamp, videoFileName, externalAudio]);

  const mimeType = getMimeType(videoFileName);

  return (
    <div className="video-player-wrapper">
      {showAudioButton && (
        <button className="audio-btn" onClick={onRequestAudio}>🔊</button>
      )}
      <video
        ref={videoRef}
        className="video-js vjs-default-skin vjs-big-play-centered"
        playsInline
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
    </div>
  );
};

export default VideoPlayer;