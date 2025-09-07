import React, { useState, useRef } from 'react';
import '../css/Upload.css';

const Upload = ({ onUploadComplete, onFileAttach }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    uploadFile(file);
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const sessionKey = localStorage.getItem('sessionKey');
      if (sessionKey) formData.append('sessionKey', sessionKey);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
          document.documentElement.style.setProperty('--progress', `${progress}%`);
        }
      };

      xhr.onload = () => {
        try {
          if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
            setUploadProgress(100);
            setIsUploading(false);

            const fileData = {
              id: result.uploadId,
              name: file.name,
              size: file.size,
              type: file.type,
              s3Url: result.s3Url,
              publicUrl: result.publicUrl,
              uploadId: result.uploadId,
              uploadedAt: new Date()
            };

            // Notify parent about upload completion
            onUploadComplete?.(fileData);
            
            // Automatically attach the newly uploaded file to chat
            onFileAttach?.(fileData);

            if (fileInputRef.current) fileInputRef.current.value = '';
          } else {
            throw new Error(`Upload failed (HTTP ${xhr.status})`);
          }
        } catch (e) {
          setError('Upload failed');
          setIsUploading(false);
          setUploadProgress(0);
        }
      };

      xhr.onerror = () => {
        setError('Network error');
        setIsUploading(false);
        setUploadProgress(0);
      };

      xhr.open('POST', 'http://localhost:5000/upload');
      xhr.withCredentials = true;
      xhr.send(formData);
    } catch (e) {
      setError('Upload failed');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!isUploading) fileInputRef.current?.click();
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h3>📁 Upload Files</h3>
        <p>Drag, drop, or click to add files directly to your chat</p>
      </div>

      <div
        className={`upload-area ${isDragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv"
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
        />

        {isUploading ? (
          <div className="upload-progress">
            <div className="progress-circle">
              <div className="progress-value">{uploadProgress}%</div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p>Uploading to AWS S3...</p>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">📤</div>
            <h4>Drag & drop files here or click to browse</h4>
            <p>PDFs, Images, Audio, Video, Documents • up to 100MB</p>
            <div className="upload-hint">
              Files will be automatically attached to your next message
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button className="error-close" onClick={() => setError('')}>×</button>
        </div>
      )}
    </div>
  );
};

export default Upload;
