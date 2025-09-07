import React, { useState, useRef, useEffect } from 'react';
import '../css/Chat.css';

const Chat = ({ messages = [], onNewMessage, attachedFiles = [], onFileRemove, allFiles = [], onFileAttach }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showMySpace, setShowMySpace] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const messagesEndRef = useRef(null);
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Safe cleaner: converts any value to string first, then removes whitespace via regex (no .trim() usage)
  const cleanText = (value) => {
    if (value === null || value === undefined) return '';
    let str;
    try { str = String(value); } catch { return ''; }
    return str.replace(/^\s+/, '').replace(/\s+$/, '');
  };

  // Safe extractor: try common text props (and nested data), fallback to object itself, always run through cleanText
  const getText = (obj) => {
    if (!obj) return '';
    const props = ['text', 'message', 'content', 'body'];
    for (let prop of props) {
      if (obj[prop] !== undefined && obj[prop] !== null) return cleanText(obj[prop]);
    }
    if (obj?.data?.text !== undefined) return cleanText(obj.data.text);
    if (obj?.data?.message !== undefined) return cleanText(obj.data.message);
    if (obj?.data?.content !== undefined) return cleanText(obj.data.content);
    return cleanText(obj);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showThinking]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'ai' && showThinking) {
      setShowThinking(false);
      setThinkingPhase('');
      setIsLocalProcessing(false);
    }
  }, [messages, showThinking]);

  // Google Slides Generator
  const generateGoogleSlides = async (aiResponse, userQuestion, files) => {
    setIsGenerating(true);
    try {
      const slides = parseAIResponseToSlides(aiResponse);
      const response = await fetch(`http://localhost:3000/api/create-google-slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides,
          title: `AI Analysis - ${new Date().toLocaleDateString()}`,
          userQuestion,
          attachedFiles: files
        })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result.success) {
        window.open(result.slideUrl, '_blank');
        return { success: true, slideUrl: result.slideUrl, presentationId: result.presentationId, slideCount: result.slideCount };
      }
      throw new Error(result.error || 'Unknown error occurred');
    } catch (error) {
      if (String(error.message).includes('Failed to fetch')) {
        return { success: false, error: 'Unable to connect to server. Make sure your backend is running on localhost:3000' };
      }
      if (String(error.message).includes('HTTP error')) {
        return { success: false, error: `Server error: ${error.message}` };
      }
      return { success: false, error: error.message };
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhanced PPT Generator
  const generatePowerPointFromAI = async (aiResponse, userQuestion, files) => {
    setIsGenerating(true);
    try {
      const slides = parseAIResponseToSlides(aiResponse);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const pptxContent = createPowerPointXML(slides, userQuestion, files);
      Object.entries(pptxContent).forEach(([path, content]) => { zip.file(path, content); });
      const blob = await zip.generateAsync({ type: 'blob' });
      const timestamp = new Date().toISOString().slice(0,16).replace('T', '_').replace(/:/g, '');
      const filename = `AI_Presentation_${timestamp}.pptx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      return { success: true, filename, slideCount: slides.length };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhanced DOCX Generator
  const generateDocxReport = async (aiResponse, userQuestion, files) => {
    setIsGenerating(true);
    try {
      const sections = parseAIResponseToSections(aiResponse);
      const docxContent = createWordDocumentXML(sections, userQuestion, files);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      Object.entries(docxContent).forEach(([path, content]) => { zip.file(path, content); });
      const blob = await zip.generateAsync({ type: 'blob' });
      const timestamp = new Date().toISOString().slice(0,16).replace('T', '_').replace(/:/g, '');
      const filename = `AI_Report_${timestamp}.docx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      window.URL.revokeObjectURL(url);
      return { success: true, filename, sectionCount: sections.length };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsGenerating(false);
    }
  };

  // Slide parsing
  const parseAIResponseToSlides = (response) => {
    const slides = [];
    const slideMarkers = String(response).match(/(?:slide\s*\d+|slide\s*\d+:|slide\s*\d+\s*[-.]|\d+\.\s*slide)/gi);
    if (slideMarkers && slideMarkers.length > 0) {
      const slideSections = String(response).split(/(?:slide\s*\d+|slide\s*\d+:|slide\s*\d+\s*[-.]|\d+\.\s*slide)/gi);
      slideSections.slice(1).forEach((section, index) => {
        if (cleanText(section)) {
          const lines = section.split('\n').filter(line => cleanText(line));
          const title = cleanText(lines)?.replace(/^[-•*]\s*/, '') || `Slide ${index + 1}`;
          const content = cleanText(lines.slice(1).join('\n'));
          slides.push({
            title: title.length > 60 ? title.substring(0, 60) + '...' : title,
            content: content || cleanText(section),
            bulletPoints: extractBulletPoints(content || section),
            slideNumber: index + 1
          });
        }
      });
    }
    if (slides.length === 0) {
      const headerRegex = /^(#{1,3}\s*.+)$/gm;
      const headers = String(response).match(headerRegex);
      if (headers) {
        const sections = String(response).split(headerRegex);
        for (let i = 1; i < sections.length; i += 2) {
          const title = cleanText(sections[i])?.replace(/^#+\s*/, '');
          const content = cleanText(sections[i + 1]) || '';
          if (title) {
            slides.push({
              title,
              content,
              bulletPoints: extractBulletPoints(content),
              slideNumber: slides.length + 1
            });
          }
        }
      }
    }
    if (slides.length === 0) {
      const sections = String(response).split(/\n\s*\n/).filter(s => cleanText(s));
      sections.forEach((section, index) => {
        const lines = section.split('\n').filter(line => cleanText(line));
        const title = cleanText(lines)?.substring(0, 50) || `Key Point ${index + 1}`;
        const content = cleanText(lines.slice(1).join('\n')) || cleanText(section);
        slides.push({ title, content, bulletPoints: extractBulletPoints(content), slideNumber: index + 1 });
      });
    }
    return slides.length > 0 ? slides : [{ title: 'AI Analysis Summary', content: String(response), bulletPoints: extractBulletPoints(String(response)), slideNumber: 1 }];
  };

  // Bullet extractor
  const extractBulletPoints = (text) => {
    const bulletRegex = /^[-•*]\s*(.+)$/gm;
    const matches = String(text).match(bulletRegex);
    return matches ? matches.map(match => cleanText(match.replace(/^[-•*]\s*/, ''))) : [];
  };

  // Section parser
  const parseAIResponseToSections = (response) => {
    const sections = [];
    const headerRegex = /^(#{1,3}\s*.+)$/gm;
    const parts = String(response).split(headerRegex);
    for (let i = 1; i < parts.length; i += 2) {
      const title = cleanText(parts[i])?.replace(/^#+\s*/, '');
      const content = cleanText(parts[i + 1]) || '';
      if (title) sections.push({ title, content });
    }
    return sections.length > 0 ? sections : [{ title: 'Analysis', content: String(response) }];
  };

  // PowerPoint XML
  const createPowerPointXML = (slides, userQuestion, files) => {
    const escapeXML = (text) => String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}
</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
      'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    ${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}
</Relationships>`,
      ...Object.fromEntries(slides.map((slide, index) => [
        `ppt/slides/slide${index + 1}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:rPr sz="4400" b="1"/><a:t>${escapeXML(slide.title)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          ${slide.bulletPoints.length > 0
            ? slide.bulletPoints.map(point => `<a:p><a:pPr lvl="0"/><a:r><a:t>${escapeXML(point)}</a:t></a:r></a:p>`).join('')
            : `<a:p><a:r><a:t>${escapeXML(slide.content)}</a:t></a:r></a:p>`}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
      ]))
    };
  };

  // Word XML
  const createWordDocumentXML = (sections, userQuestion, files) => {
    const escapeXML = (text) => String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const contentXML = sections.map(section => `
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXML(section.title)}</w:t></w:r></w:p>
      ${String(section.content).split('\n').map(line =>
        cleanText(line) ? `<w:p><w:r><w:t>${escapeXML(line)}</w:t></w:r></w:p>` : '<w:p/>'
      ).join('')}
    `).join('');

    return {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:sz w:val="36"/><w:b/></w:rPr><w:t>AI Generated Analysis Report</w:t></w:r></w:p>
    <w:p><w:r><w:t>Generated: ${new Date().toLocaleString()}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Request: ${escapeXML(userQuestion)}</w:t></w:r></w:p>
    <w:p/>
    ${contentXML}
  </w:body>
</w:document>`
    };
  };

  // Generation handler (no .trim anywhere)
  const handleGenerate = async (type) => {
    try {
      const aiMessages = (messages || []).filter(m => m?.sender === 'ai');
      const userMessages = (messages || []).filter(m => m?.sender === 'user');
      const lastAIMessage = aiMessages[aiMessages.length - 1];
      const lastUserMessage = userMessages[userMessages.length - 1];
      if (!lastAIMessage || !lastUserMessage) throw new Error('No messages found');

      const aiText = getText(lastAIMessage);
      const userText = getText(lastUserMessage);
      if (!aiText || !userText) throw new Error('Empty message content');

      let result;
      switch (type) {
        case 'google-slides':
          result = await generateGoogleSlides(aiText, userText, attachedFiles);
          break;
        case 'ppt':
          result = await generatePowerPointFromAI(aiText, userText, attachedFiles);
          break;
        case 'docx':
          result = await generateDocxReport(aiText, userText, attachedFiles);
          break;
        default:
          throw new Error(`Unknown type: ${type}`);
      }

      if (result?.success) {
        const successMsg = {
          id: Date.now(),
          sender: 'system',
          text: type === 'google-slides'
            ? `✅ Google Slides created!\n🔗 ${result.slideUrl}\n📊 ${result.slideCount} slides`
            : type === 'ppt'
            ? `✅ PowerPoint generated!\n📁 ${result.filename}\n📊 ${result.slideCount} slides`
            : `✅ Word document generated!\n📁 ${result.filename}\n📊 ${result.sectionCount} sections`,
          timestamp: new Date(),
          attachedFiles: []
        };
        setTimeout(() => onNewMessage(successMsg, true), 500);
      } else {
        throw new Error(result?.error || 'Generation failed');
      }
    } catch (error) {
      const errorMsg = {
        id: Date.now(),
        sender: 'system',
        text: `❌ Error: ${error.message}`,
        timestamp: new Date(),
        attachedFiles: []
      };
      onNewMessage(errorMsg, true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cleanText(inputMessage) || isLocalProcessing) return;
    setIsLocalProcessing(true);
    setShowThinking(true);
    setThinkingPhase('Processing your request...');
    const getThinkingSequence = () => {
      if (attachedFiles.length > 0) {
        const hasPDFs = attachedFiles.some(f => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'));
        const hasImages = attachedFiles.some(f => f.type?.startsWith('image/'));
        return [
          { phase: 'Analyzing your question...', duration: 800 },
          { phase: 'Scanning attached files...', duration: 600 },
          ...(hasPDFs ? [
            { phase: '📊 Attempting advanced Textract analysis...', duration: 1500 },
            { phase: '⚠️ Trying alternative extraction methods...', duration: 1200 },
            { phase: '🔄 Starting PDF.js fallback extraction...', duration: 1000 },
            { phase: '✅ Document extraction successful!', duration: 800 }
          ] : []),
          ...(hasImages ? [
            { phase: '📸 Processing image content...', duration: 1000 },
            { phase: '🔍 Analyzing visual elements...', duration: 800 }
          ] : []),
          { phase: 'Extracting key information...', duration: 1000 },
          { phase: 'Structuring data for analysis...', duration: 800 },
          { phase: 'Generating comprehensive response...', duration: 1200 },
          { phase: 'Finalizing template suggestions...', duration: 600 }
        ];
      } else {
        return [
          { phase: 'Understanding your request...', duration: 600 },
          { phase: 'Preparing response framework...', duration: 800 },
          { phase: 'Generating response...', duration: 1000 },
          { phase: 'Finalizing output...', duration: 400 }
        ];
      }
    };
    const thinkingSequence = getThinkingSequence();
    let currentStep = 0;
    const executeThinkingStep = () => {
      if (currentStep < thinkingSequence.length && showThinking) {
        setThinkingPhase(thinkingSequence[currentStep].phase);
        setTimeout(() => { currentStep++; executeThinkingStep(); }, thinkingSequence[currentStep].duration);
      } else {
        setThinkingPhase('🤖 Processing with AI...');
      }
    };
    executeThinkingStep();
    onNewMessage(cleanText(inputMessage));
    setInputMessage('');
  };

  const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const removeFileFromChat = (fileId) => onFileRemove?.(fileId);
  const addFileFromMySpace = (file) => { onFileAttach?.(file); setShowMySpace(false); };
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024, units = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  };
  const availableFiles = allFiles.filter(f => !attachedFiles.find(af => af.id === f.id));

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-title">
          <h3>🎯 AI Template Generator</h3>
          <div className="chat-status">Powered by AI • Generate Real PPT, Google Slides & DOCX Files</div>
        </div>
        {attachedFiles.length > 0 && (
          <div className="attached-files-indicator">
            <span className="attachment-icon">📎</span>
            <span>{attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} ready</span>
          </div>
        )}
      </div>

      <div className="chat-messages">
        {availableFiles.length > 0 && (
          <div className="myspace-section">
            <div className="myspace-header" onClick={() => setShowMySpace(!showMySpace)}>
              <div className="myspace-title">
                <span className="myspace-icon">📁</span>
                <span>MySpace ({availableFiles.length} files)</span>
              </div>
              <div className={`myspace-toggle ${showMySpace ? 'open' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                </svg>
              </div>
            </div>
            {showMySpace && (
              <div className="myspace-files">
                {availableFiles.map(file => (
                  <div key={file.id} className="myspace-file-item" onClick={() => addFileFromMySpace(file)}>
                    <div className="file-icon">
                      {file.type?.startsWith('image/') ? '🖼️' : file.type?.startsWith('audio/') ? '🎵' : file.type?.startsWith('video/') ? '🎬' : '📄'}
                    </div>
                    <div className="file-details">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">{formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}</div>
                    </div>
                    <div className="file-add-icon">+</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">🎯</div>
            <h4>AI-Powered Template Generation Engine</h4>
            <p>Upload files or ask AI to create professional presentations and documents.</p>
            <div className="workflow-steps">
              <div className="step"><span className="step-number">1</span><div className="step-content"><strong>Upload or Ask</strong><p>Upload files or ask AI to structure content</p></div></div>
              <div className="step"><span className="step-number">2</span><div className="step-content"><strong>AI Processing</strong><p>AI analyzes and structures your content</p></div></div>
              <div className="step"><span className="step-number">3</span><div className="step-content"><strong>Generate Files</strong><p>Create real PowerPoint, Google Slides & Word documents</p></div></div>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
              <div className={`message ${msg.sender}-message`}>
                <div className="message-avatar">
                  {msg.sender === 'user' ? '👤' : msg.sender === 'ai' ? '🤖' : msg.sender === 'system' ? '✅' : 'ℹ️'}
                </div>
                <div className="message-content">
                  <div className="message-text">
                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit'}}>
                      {getText(msg)}
                    </pre>
                  </div>

                  {msg.sender === 'ai' && (
  <div className="generation-actions">
    <button
      className="generate-btn icon-only google-slides-btn"
      onClick={() => handleGenerate('google-slides')}
      disabled={isGenerating}
      aria-label={isGenerating ? 'Creating Google Slides' : 'Create Google Slides'}
      title="Create Google Slides"
    >
      {/* icon only */}
      <span aria-hidden="true">🌐</span>
    </button>

    <button
      className="generate-btn icon-only ppt-btn"
      onClick={() => handleGenerate('ppt')}
      disabled={isGenerating}
      aria-label={isGenerating ? 'Generating PowerPoint' : 'Generate PowerPoint'}
      title="Generate PowerPoint"
    >
      <span aria-hidden="true">📊</span>
    </button>

    <button
      className="generate-btn icon-only docx-btn"
      onClick={() => handleGenerate('docx')}
      disabled={isGenerating}
      aria-label={isGenerating ? 'Generating Word Document' : 'Generate Word Document'}
      title="Generate Word Document"
    >
      <span aria-hidden="true">📄</span>
    </button>

    <div className="slide-preview">
      AI will auto-detect slides and sections • Cloud & Local options
    </div>
  </div>
)}
                  {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className="message-attachments">
                      <div className="attachments-header">📎 Attached Files:</div>
                      <div className="attachments-list">
                        {msg.attachedFiles.map(f => (
                          <div key={f.id} className="attachment-item">
                            <span className="attachment-icon">
                              {f.type?.startsWith('image/') ? '🖼️' : f.type?.startsWith('audio/') ? '🎵' : f.type?.startsWith('video/') ? '🎬' : '📄'}
                            </span>
                            <span className="attachment-name">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="message-time">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            </div>
          ))
        )}

        {showThinking && (
          <div className="message-wrapper ai">
            <div className="message ai-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="thinking-container">
                  <div className="thinking-indicator"><span></span><span></span><span></span></div>
                  <div className="thinking-text">{thinkingPhase || 'Processing your request...'}</div>
                </div>
                <div className="thinking-progress">
                  <div className="progress-bar"><div className="progress-fill"></div></div>
                </div>
                {attachedFiles.length > 0 && (
                  <div className="processing-details">
                    <div className="processing-files">Processing {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''}...</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-section">
        {attachedFiles.length > 0 && (
          <div className="input-files-preview">
            <div className="files-chips-container">
              {attachedFiles.map(f => (
                <div key={f.id} className="input-file-chip">
                  <div className="file-chip-icon">
                    {f.type?.startsWith('image/') ? '🖼️' : f.type?.startsWith('audio/') ? '🎵' : f.type?.startsWith('video/') ? '🎬' : '📄'}
                  </div>
                  <div className="file-chip-details">
                    <span className="file-chip-name">{f.name}</span>
                    <span className="file-chip-size">{f.size ? `${Math.round(f.size / 1024)} KB` : ''}</span>
                  </div>
                  <button className="file-chip-remove" onClick={() => removeFileFromChat(f.id)} title="Remove from chat">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form className="chat-input-form" onSubmit={handleSubmit}>
          <div className="input-container">
            <div className="input-wrapper">
              <input
                type="text"
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                placeholder={
                  attachedFiles.length > 0
                    ? `Ask about your ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}...`
                    : 'Ask AI to create presentations, reports, or analyze content...'
                }
                className="chat-input"
                disabled={isLocalProcessing}
              />
              <button
                type="submit"
                className="send-button"
                disabled={!cleanText(inputMessage) || isLocalProcessing}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
