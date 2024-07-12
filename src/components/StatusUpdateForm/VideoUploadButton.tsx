import React from 'react';

interface VideoUploadButtonProps {
  handleFiles: (files: FileList) => void;
  multiple?: boolean;
}

const VideoUploadButton: React.FC<VideoUploadButtonProps> = ({ handleFiles, multiple = false }) => {
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files as FileList);
    event.target.value = '';
  };

  return <input type="file" accept="video/*" multiple={multiple} onChange={onChange} />;
};

export default VideoUploadButton;
