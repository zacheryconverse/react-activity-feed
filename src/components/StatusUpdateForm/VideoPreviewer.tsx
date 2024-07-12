import React from 'react';

interface VideoUpload {
  id: string;
  state: string;
  url: string;
}

interface VideoPreviewerProps {
  handleFiles: (files: File[]) => void;
  handleRemove: (id: string) => void;
  handleRetry: (id: string) => void;
  videoUploads: VideoUpload[];
}

const VideoPreviewer: React.FC<VideoPreviewerProps> = ({ videoUploads, handleRemove, handleRetry, handleFiles }) => {
  return (
    <div>
      {videoUploads.map((upload) => (
        <div key={upload.id}>
          <video width="320" height="240" controls>
            <source src={upload.url} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <button onClick={() => handleRemove(upload.id)}>Remove</button>
          {upload.state === 'failed' && <button onClick={() => handleRetry(upload.id)}>Retry</button>}
        </div>
      ))}
      <input
        type="file"
        accept="video/*"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            handleFiles(Array.from(e.target.files));
          }
        }}
      />
    </div>
  );
};

export default VideoPreviewer;
