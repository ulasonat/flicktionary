import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';

interface VideoPlayerProps {
  videoUrl: string;
  subtitleUrl: string;
  beginTimestamp: string;
  endTimestamp: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  subtitleUrl,
  beginTimestamp,
  endTimestamp
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);

  // Convert timestamp to seconds
  const timestampToSeconds = (timestamp: string): number => {
    const [time, ms] = timestamp.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + (ms ? parseInt(ms) / 1000 : 0);
  };

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    // Initialize video.js player
    const player = videojs(videoRef.current, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      fluid: true,
      playbackRates: [0.5, 1, 1.5, 2]
    });

    playerRef.current = player;

    // Set up video segment
    const startTime = timestampToSeconds(beginTimestamp) - 1;
    const endTime = timestampToSeconds(endTimestamp) + 1;

    player.ready(() => {
      player.currentTime(startTime);
      
      player.on('timeupdate', () => {
        const currentTime = player.currentTime();
        if (currentTime && currentTime >= endTime) {
          player.pause();
          player.currentTime(startTime);
        }
      });
    });

    return () => {
      const currentPlayer = playerRef.current;
      if (currentPlayer && !currentPlayer.isDisposed()) {
        currentPlayer.dispose();
        playerRef.current = null;
      }
    };
  }, [videoUrl, subtitleUrl, beginTimestamp, endTimestamp]);

  return (
    <div className="video-player-wrapper">
      <video
        ref={videoRef}
        className="video-js vjs-default-skin vjs-big-play-centered"
        playsInline
      >
        <source src={videoUrl} type="video/mp4" />
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            label="English"
            default
          />
        )}
      </video>
    </div>
  );
};

export default VideoPlayer;