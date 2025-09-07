const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const redisClient = require('./redisClient');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const AWS = require('aws-sdk');
const pdf = require('pdf-parse');
require('dotenv').config();

// Initialize Groq SDK
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// AWS SDK v3 imports for Transcribe and Textract
const { 
  TranscribeClient, 
  StartTranscriptionJobCommand, 
  GetTranscriptionJobCommand 
} = require('@aws-sdk/client-transcribe');

// Initialize Express app
const app = express();
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// AWS Configuration
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// AWS v2 services (S3, Textract)
const s3 = new AWS.S3();
const textract = new AWS.Textract();

// AWS v3 Transcribe client
const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true)
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

// MongoDB setup
let db;
const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db('techolution');
    console.log('Connected to MongoDB - techolution database!');

    // Indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('uploads').createIndex({ userId: 1 });
    await db.collection('uploads').createIndex({ uploadedAt: -1 });
    await db.collection('conversations').createIndex({ userId: 1, updatedAt: -1 });
    await db.collection('messages').createIndex({ conversationId: 1, createdAt: 1 });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'example@gmail.com',
    pass: process.env.EMAIL_PASS || 'app-password',
  },
});

// Helper function to generate unique user ID
const generateUserId = async () => {
  let userid; let exists = true;
  while (exists) {
    userid = Math.floor(1000 + Math.random() * 9000);
    const count = await db.collection('users').countDocuments({ userid });
    if (count === 0) exists = false;
  }
  return userid.toString();
};


async function extractPDFContentWithTextract(s3Key) {
  console.log(`🔍 Starting PDF extraction for: ${s3Key}`);
  
  try {
    console.log('📊 Attempting advanced Textract analysis...');
    const advancedParams = {
      Document: { 
        S3Object: { 
          Bucket: process.env.S3_BUCKET_NAME, 
          Name: s3Key 
        } 
      },
      FeatureTypes: ['TABLES', 'FORMS']
    };

    try {
      const result = await textract.analyzeDocument(advancedParams).promise();
      console.log('✅ Advanced Textract analysis successful');
      return processTextractResults(result, 'Advanced Textract Analysis');
    } catch (advancedError) {
      console.log(`⚠️ Advanced analysis failed: ${advancedError.code}`);
      
      // ATTEMPT 2: Try basic text detection
      console.log('📝 Attempting basic Textract text detection...');
      if (advancedError.code === 'UnsupportedDocumentException' || 
          advancedError.code === 'InvalidParameterException') {
        
        try {
          const basicParams = {
            Document: { 
              S3Object: { 
                Bucket: process.env.S3_BUCKET_NAME, 
                Name: s3Key 
              } 
            }
          };

          const basicResult = await textract.detectDocumentText(basicParams).promise();
          console.log('✅ Basic Textract text detection successful');
          return processTextractResults(basicResult, 'Basic Textract Text Detection');
        } catch (basicError) {
          console.log(`⚠️ Basic Textract failed: ${basicError.code}`);
          throw basicError; // Move to final fallback
        }
      }
      throw advancedError;
    }

  } catch (textractError) {
    console.log(`❌ All Textract methods failed, trying PDF.js fallback...`);
    
    // ATTEMPT 3: Final fallback using PDF.js
    try {
      return await fallbackPDFExtraction(s3Key);
    } catch (fallbackError) {
      console.error('❌ All PDF extraction methods failed:', fallbackError);
      return generateFailureMessage(s3Key, textractError, fallbackError);
    }
  }
}

// Process Textract results into formatted content
function processTextractResults(result, extractionType) {
  let extractedText = '';
  let tables = [];
  let keyValuePairs = [];
  let wordCount = 0;

  result.Blocks.forEach(block => {
    if (block.BlockType === 'LINE') {
      extractedText += block.Text + '\n';
      wordCount += block.Text.split(' ').length;
    } else if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
      keyValuePairs.push(block.Text || '');
    } else if (block.BlockType === 'TABLE') {
      tables.push(`Table ${tables.length + 1} detected`);
    }
  });

  let formattedContent = `📝 **EXTRACTED TEXT (${extractionType}):**\n\n${extractedText}\n`;
  
  if (keyValuePairs.length > 0) {
    formattedContent += `\n🔑 **FORM FIELDS DETECTED:**\n${keyValuePairs.slice(0, 10).join('\n')}\n`;
    if (keyValuePairs.length > 10) {
      formattedContent += `... and ${keyValuePairs.length - 10} more fields\n`;
    }
  }
  
  if (tables.length > 0) {
    formattedContent += `\n📊 **TABLES DETECTED:**\n${tables.join('\n')}\n`;
  }

  formattedContent += `\n📈 **EXTRACTION SUMMARY:**\n`;
  formattedContent += `• Method: ${extractionType}\n`;
  formattedContent += `• Total blocks: ${result.Blocks.length}\n`;
  formattedContent += `• Text lines: ${result.Blocks.filter(b => b.BlockType === 'LINE').length}\n`;
  formattedContent += `• Estimated words: ${wordCount}\n`;
  formattedContent += `• Tables found: ${tables.length}\n`;
  formattedContent += `• Form fields: ${keyValuePairs.length}`;

  return formattedContent;
}

// Fallback PDF extraction using PDF.js
async function fallbackPDFExtraction(s3Key) {
  console.log('🔄 Starting PDF.js fallback extraction...');
  
  try {
    // Download PDF from S3
    const pdfObject = await s3.getObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key
    }).promise();
    
    const data = await pdf(pdfObject.Body);
    
    const wordCount = data.text.split(/\s+/).filter(word => word.length > 0).length;
    
    let formattedContent = `📝 **EXTRACTED TEXT (PDF.js Fallback):**\n\n${data.text}\n\n`;
    
    formattedContent += `📈 **EXTRACTION SUMMARY:**\n`;
    formattedContent += `• Method: PDF.js Parser (Fallback)\n`;
    formattedContent += `• Pages: ${data.numpages}\n`;
    formattedContent += `• Characters: ${data.text.length}\n`;
    formattedContent += `• Words: ${wordCount}\n`;
    formattedContent += `• Status: ✅ Successfully extracted using fallback method`;
    
    console.log('✅ PDF.js fallback extraction successful');
    return formattedContent;
    
  } catch (error) {
    console.error('❌ PDF.js fallback failed:', error);
    throw new Error(`PDF.js extraction failed: ${error.message}`);
  }
}

// Generate comprehensive failure message
function generateFailureMessage(s3Key, textractError, fallbackError) {
  return `❌ **PDF EXTRACTION FAILED**

📄 **File:** ${s3Key.split('/').pop()}

🔍 **Attempted Methods:**
1. ❌ Advanced Textract Analysis - ${textractError.code || 'Failed'}
2. ❌ Basic Textract Text Detection - ${textractError.code || 'Failed'} 
3. ❌ PDF.js Parser Fallback - ${fallbackError.message || 'Failed'}

⚠️ **Issue:** This PDF format is not supported by any of our extraction methods.

💡 **Suggestions:**
• Try converting the PDF to a different format
• Ensure the PDF is not password-protected
• Check if the PDF contains extractable text (not scanned images)
• Consider using an OCR-enabled version of the document

🔧 **Technical Details:**
• Primary error: ${textractError.code}
• Fallback error: ${fallbackError.message}

The AI will proceed with analysis using the filename and any other available context.`;
}

// Enhanced image processing with Groq Vision
async function processImageWithGroq(imageUrl) {
  try {
    console.log(`Processing image with Groq Vision: ${imageUrl}`);
    
    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: '📸 Analyze this image comprehensively. Extract ALL visible text, describe charts/diagrams, identify key visual elements, tables, forms, and any important information. Provide a detailed analysis suitable for business document processing.' 
          },
          { 
            type: 'image_url', 
            image_url: { url: imageUrl } 
          }
        ]
      }],
      model: 'llama-3.2-vision',  // Use vision model
      max_tokens: 1024,
      temperature: 0.3
    });
    
    const analysis = completion.choices[0].message.content;
    return `🖼️ **IMAGE ANALYSIS:**\n${analysis}`;
  } catch (error) {
    console.error('Enhanced image processing error:', error);
    return `❌ Failed to process image with Groq Vision: ${error.message}`;
  }
}

// FIXED: Audio extraction using AWS SDK v3
async function extractAudioContent(s3Key) {
  try {
    const jobName = `job-${Date.now()}`;
    
    // Start transcription job using v3 SDK
    const startCommand = new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: 'en-US',
      MediaFormat: 'mp3',
      Media: { MediaFileUri: `s3://${process.env.S3_BUCKET_NAME}/${s3Key}` },
      OutputBucketName: process.env.S3_BUCKET_NAME
    });

    await transcribeClient.send(startCommand);

    // Poll for completion
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const getCommand = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName
      });
      
      const result = await transcribeClient.send(getCommand);
      status = result.TranscriptionJob.TranscriptionJobStatus;
      attempts++;
    }

    if (status === 'COMPLETED') {
      const getCommand = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName
      });
      
      const result = await transcribeClient.send(getCommand);
      const transcriptUri = result.TranscriptionJob.Transcript.TranscriptFileUri;
      const response = await fetch(transcriptUri);
      const transcript = await response.json();
      return transcript.results.transcripts[0].transcript;
    }
    return 'Audio transcription failed or timed out';
  } catch (error) {
    console.error('Audio extraction error:', error);
    return 'Failed to transcribe audio content';
  }
}

// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

app.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, username, gender, contactNo, dob, terms, subscribe } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const users = db.collection('users');
    const existingUser = await users.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const userid = await generateUserId();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      password: hashedPassword,
      fullName: fullName || '',
      username: username || '',
      gender: gender || '',
      contactNo: contactNo || '',
      dob: dob || '',
      userid,
      terms: (terms === 'Yes' || terms === true),
      subscribe: (subscribe === 'Yes' || subscribe === true),
      createdAt: new Date(),
    };

    await users.insertOne(newUser);
    res.json({ message: 'Registered successfully', userid });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const users = db.collection('users');
    const user = await users.findOne({ email });
    if (!user) return res.status(400).json({ error: "User doesn't exist" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    let sessionKey = user.sessionKey;
    let cachedUserData = null;

    try {
      if (sessionKey) cachedUserData = await redisClient.get(sessionKey);
    } catch (redisError) {
      console.error('Redis error:', redisError);
    }

    if (!cachedUserData) {
      const userPayload = {
        fullName: user.fullName || '',
        username: user.username || '',
        email: user.email,
        gender: user.gender || '',
        contactNo: user.contactNo || '',
        dob: user.dob || '',
        userid: user.userid,
        dreams: [],
      };

      sessionKey = crypto.createHash('sha256').update(JSON.stringify(userPayload)).digest('hex');
      await users.updateOne({ email }, { $set: { sessionKey, lastLogin: new Date() } });

      try {
        await redisClient.set(sessionKey, JSON.stringify(userPayload), { EX: 60 * 60 * 24 * 7 });
      } catch (redisError) {
        console.error('Redis set error:', redisError);
      }
    }

    res.json({ message: 'Login successful', sessionKey, redirectTo: '/home' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.get('/userfromsession/:sessionKey', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    let cachedUserData = null;

    try {
      cachedUserData = await redisClient.get(sessionKey);
    } catch (redisError) {
      console.error('Redis error:', redisError);
    }

    if (cachedUserData) return res.json({ user: JSON.parse(cachedUserData) });

    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'Session not found' });

    const userPayload = {
      fullName: user.fullName || '',
      username: user.username || '',
      email: user.email,
      gender: user.gender || '',
      contactNo: user.contactNo || '',
      dob: user.dob || '',
      userid: user.userid,
      dreams: [],
    };

    try {
      await redisClient.set(sessionKey, JSON.stringify(userPayload), { EX: 60 * 60 * 24 * 7 });
    } catch (redisError) {
      console.error('Redis set error:', redisError);
    }

    res.json({ user: userPayload });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error while fetching user.' });
  }
});

app.post('/logout', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required to logout' });

    const users = db.collection('users');
    const result = await users.updateOne({ email }, { $unset: { sessionKey: "" } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// =====================================================
// CONVERSATIONS & MESSAGES
// =====================================================

app.post('/conversations', async (req, res) => {
  try {
    const { sessionKey, title } = req.body;
    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const conversations = db.collection('conversations');
    await conversations.updateMany({ userId: user.userid }, { $set: { isActive: false } });

    const conversation = {
      conversationId: uuidv4(),
      userId: user.userid,
      title: title || 'New Chat',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await conversations.insertOne(conversation);
    res.json({ conversation });
  } catch (e) {
    console.error('Create conversation error:', e);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/conversations/:sessionKey', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const conversations = db.collection('conversations');
    const list = await conversations.find({ userId: user.userid }).sort({ updatedAt: -1 }).toArray();

    res.json({ conversations: list });
  } catch (e) {
    console.error('List conversations error:', e);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

app.patch('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { sessionKey, title, setActive } = req.body;

    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const conversations = db.collection('conversations');
    if (setActive) await conversations.updateMany({ userId: user.userid }, { $set: { isActive: false } });

    const update = { updatedAt: new Date() };
    if (title) update.title = title;
    if (setActive) update.isActive = true;

    const result = await conversations.updateOne({ conversationId, userId: user.userid }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Conversation not found' });

    const convo = await conversations.findOne({ conversationId, userId: user.userid });
    res.json({ conversation: convo });
  } catch (e) {
    console.error('Update conversation error:', e);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

app.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = db.collection('messages');
    const uploads = db.collection('uploads');

    const list = await messages.find({ conversationId }).sort({ createdAt: 1 }).toArray();

    const expanded = await Promise.all(list.map(async (m) => {
      if (!m.attachedUploadIds || m.attachedUploadIds.length === 0) return m;
      
      const files = await uploads
        .find({ uploadId: { $in: m.attachedUploadIds }, isActive: true })
        .project({ uploadId: 1, originalName: 1 })
        .toArray();
      
      return { 
        ...m, 
        attachments: files.map(f => ({ 
          uploadId: f.uploadId, 
          originalName: f.originalName 
        }))
      };
    }));

    res.json({ messages: expanded });
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Enhanced AI chat with proper Textract integration
app.post('/ai-chat', async (req, res) => {
  try {
    const { sessionKey, conversationId, text, attachedUploadIds = [] } = req.body;

    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const conversations = db.collection('conversations');
    const convo = await conversations.findOne({ conversationId, userId: user.userid });
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });

    const messagesCol = db.collection('messages');
    const uploads = db.collection('uploads');

    // Store user message first
    const userMsg = {
      messageId: uuidv4(),
      conversationId,
      userId: user.userid,
      role: 'user',
      text,
      attachedUploadIds,
      createdAt: new Date()
    };
    await messagesCol.insertOne(userMsg);

    let aiResponseText = '';

    // If files are attached, process them with enhanced extraction
    if (attachedUploadIds.length > 0) {
      console.log(`Processing ${attachedUploadIds.length} attached files...`);
      
      const files = await uploads.find({ 
        uploadId: { $in: attachedUploadIds }, 
        isActive: true 
      }).toArray();
      
      let combinedExtractedContent = '';
      let processingSummary = `📄 **Document Analysis Results**\n\nProcessed ${files.length} file(s):\n\n`;

      for (const file of files) {
        console.log(`Processing file: ${file.originalName} (${file.mimeType})`);
        let extractedContent = '';
        let processingStatus = '';
        
        try {
          if (file.mimeType === 'application/pdf') {
            extractedContent = await extractPDFContentWithTextract(file.s3Key);
            processingStatus = `✅ **${file.originalName}** - PDF processed successfully`;
          } else if (file.mimeType.startsWith('image/')) {
            extractedContent = await processImageWithGroq(file.presignedUrl);
            processingStatus = `✅ **${file.originalName}** - Image analyzed successfully`;
          } else if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) {
            extractedContent = await extractAudioContent(file.s3Key);
            processingStatus = `✅ **${file.originalName}** - Audio transcribed successfully`;
          } else {
            extractedContent = `File type ${file.mimeType} processing not yet supported.`;
            processingStatus = `⚠️ **${file.originalName}** - File type not supported`;
          }
        } catch (error) {
          console.error(`Failed to process ${file.originalName}:`, error);
          extractedContent = `❌ Processing failed: ${error.message}\n\nThe file "${file.originalName}" could not be processed, but the AI can still help with questions about this type of document based on the filename and context.`;
          processingStatus = `❌ **${file.originalName}** - Processing failed`;
        }
        
        processingSummary += processingStatus + '\n';
        combinedExtractedContent += `\n\n--- CONTENT FROM: ${file.originalName} ---\n${extractedContent}\n${'='.repeat(50)}`;
      }

      // Enhanced prompt for AI with extracted content
      const enhancedPrompt = `
User Query: ${text}

${processingSummary}

EXTRACTED DOCUMENT CONTENT:
${combinedExtractedContent}

Instructions: Analyze the extracted content above and respond to the user's query. If the user asked "yes" or wants a general analysis, provide:
1. Key insights and summaries from the documents
2. Important findings or data points
3. 3-5 strategic questions to better understand their needs for creating professional deliverables
4. Suggestions for what kind of templates or reports could be created

If they asked a specific question, focus your response on that question using the extracted content as context.
`;

      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert document analyst and consultant specializing in creating professional deliverables. Analyze provided content and help users create reports, presentations, summaries, and other professional documents. Always cite specific information from the extracted content when possible.'
          },
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2048
      });

      aiResponseText = completion.choices[0].message.content;

    } else {
      // Regular chat without files
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant specialized in document analysis and professional deliverable creation. Help users create reports, presentations, summaries, and other professional documents.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 1024
      });

      aiResponseText = completion.choices[0].message.content;
    }

    // Store AI response
    const aiMsg = {
      messageId: uuidv4(),
      conversationId,
      userId: user.userid,
      role: 'ai',
      text: aiResponseText,
      attachedUploadIds: [],
      createdAt: new Date()
    };
    await messagesCol.insertOne(aiMsg);

    await conversations.updateOne({ conversationId }, { $set: { updatedAt: new Date() } });

    res.json({ response: aiResponseText });
  } catch (e) {
    console.error('AI chat error:', e);
    res.status(500).json({ error: 'AI processing failed: ' + e.message });
  }
});

// =====================================================
// FILE UPLOAD ROUTES
// =====================================================

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { sessionKey } = req.body;
    let userId = null, userEmail = null, username = null;

    if (sessionKey) {
      const users = db.collection('users');
      const user = await users.findOne({ sessionKey });
      if (user) {
        userId = user.userid;
        userEmail = user.email;
        username = user.username || user.fullName || 'Unknown';
      }
    }

    const fileExtension = req.file.originalname.split('.').pop() || 'bin';
    const fileName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
    const s3Key = userId ? `uploads/${userId}/${fileName}` : `uploads/anonymous/${fileName}`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ContentDisposition: 'inline',
      Metadata: {
        originalName: req.file.originalname,
        uploadedBy: userId || 'anonymous',
        uploadDate: new Date().toISOString(),
        userEmail: userEmail || 'anonymous',
        username: username || 'anonymous'
      }
    };

    const s3Response = await s3.upload(uploadParams).promise();

    const presignedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 7 * 24 * 60 * 60
    });

    // Pre-validate PDF compatibility for Textract (optional enhancement)
    let textractCompatible = true;
    let extractionMethod = 'textract';

    if (req.file.mimetype === 'application/pdf') {
      try {
        // Quick test with detectDocumentText to check compatibility
        const testParams = {
          Document: { S3Object: { Bucket: process.env.S3_BUCKET_NAME, Name: s3Key } }
        };
        await textract.detectDocumentText(testParams).promise();
        console.log(`✅ PDF ${req.file.originalname} is Textract compatible`);
      } catch (testError) {
        if (testError.code === 'UnsupportedDocumentException') {
          textractCompatible = false;
          extractionMethod = 'pdf-parser';
          console.log(`⚠️ PDF ${req.file.originalname} requires alternative extraction method`);
        }
      }
    }

    const uploads = db.collection('uploads');
    const uploadData = {
      uploadId: uuidv4(),
      userId: userId,
      username: username || 'Anonymous',
      email: userEmail || 'anonymous@example.com',
      originalName: req.file.originalname,
      fileName: fileName,
      s3Key: s3Key,
      s3Url: s3Response.Location,
      presignedUrl: presignedUrl,
      size: req.file.size,
      mimeType: req.file.mimetype,
      fileExtension: fileExtension,
      uploadedAt: new Date(),
      isActive: true,
      downloadCount: 0,
      lastAccessedAt: new Date(),
      textractCompatible: textractCompatible,
      extractionMethod: extractionMethod
    };

    await uploads.insertOne(uploadData);

    res.json({
      message: 'File uploaded successfully',
      uploadId: uploadData.uploadId,
      s3Url: s3Response.Location,
      publicUrl: presignedUrl,
      fileName: fileName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      textractCompatible: textractCompatible,
      uploadedBy: { userId, username, email: userEmail }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

app.get('/uploads/:sessionKey', async (req, res) => {
  try {
    const { sessionKey } = req.params;
    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uploads = db.collection('uploads');
    const userUploads = await uploads.find({ userId: user.userid, isActive: true })
      .sort({ uploadedAt: -1 })
      .toArray();

    res.json({
      uploads: userUploads,
      totalCount: userUploads.length,
      user: {
        userId: user.userid,
        username: user.username || user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ error: 'Failed to retrieve uploads' });
  }
});

app.delete('/uploads/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { sessionKey } = req.body;

    const users = db.collection('users');
    const user = await users.findOne({ sessionKey });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uploads = db.collection('uploads');
    const uploadDoc = await uploads.findOne({ uploadId, userId: user.userid });
    if (!uploadDoc) return res.status(404).json({ error: 'Upload not found' });

    await s3.deleteObject({ Bucket: process.env.S3_BUCKET_NAME, Key: uploadDoc.s3Key }).promise();

    await uploads.updateOne({ uploadId }, { $set: { isActive: false, deletedAt: new Date() } });
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

app.post('/uploads/:uploadId/access', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const uploads = db.collection('uploads');
    await uploads.updateOne(
      { uploadId, isActive: true },
      { $inc: { downloadCount: 1 }, $set: { lastAccessedAt: new Date() } }
    );
    res.json({ message: 'Access recorded' });
  } catch (error) {
    console.error('Record access error:', error);
    res.status(500).json({ error: 'Failed to record access' });
  }
});


app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Techolution AI Backend',
    version: '1.0.0',
    description: 'Backend API for AI-powered template generation with multimodal processing',
    endpoints: {
      auth: ['POST /register', 'POST /login', 'GET /userfromsession/:sessionKey', 'POST /logout'],
      files: ['POST /upload', 'GET /uploads/:sessionKey', 'DELETE /uploads/:uploadId', 'POST /uploads/:uploadId/access'],
      conversations: ['POST /conversations', 'GET /conversations/:sessionKey', 'PATCH /conversations/:conversationId', 'GET /conversations/:conversationId/messages'],
      ai: ['POST /ai-chat'],
      utility: ['GET /api/health', 'GET /api/info']
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.method} ${req.originalUrl} does not exist`,
    availableRoutes: '/api/info'
  });
});

// =====================================================
// SERVER STARTUP & SHUTDOWN
// =====================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Groq AI integration enabled`);
  console.log(`📡 API Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📋 API Information: http://localhost:${PORT}/api/info`);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  try {
    await client.close();
    console.log('✅ MongoDB connection closed.');
  } catch (error) {
    console.error('❌ Error closing MongoDB:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received. Shutting down gracefully...');
  try {
    await client.close();
    console.log('✅ MongoDB connection closed.');
  } catch (error) {
    console.error('❌ Error closing MongoDB:', error);
  }
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize database connection
connectToMongoDB().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
