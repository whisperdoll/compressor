import React, { useRef, useState } from "react";

interface Props {
  onUpload: (files: FileList) => void;
}

const FileUpload: React.FC<Props> = ({ onUpload }) => {
  return (
    <input
      type="file"
      accept="audio/*"
      onChange={(e) => e.target.files && onUpload(e.target.files)}
    />
  );
};

export default FileUpload;
