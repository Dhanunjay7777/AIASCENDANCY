import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slides, title, userQuestion } = req.body;

    // Hardcoded Service Account credentials from your JSON file
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: "gen-lang-client-0415376281",
        private_key_id: "5662acadec8679a7c7e656d2bc816c50961afb7b",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCPTkz3W8SkzBKe\nfBqEEvAXSi3wvW4XvipKCiAazEcbZAIMaAkF5ju8fUz9K9UWGgHHZpSuA4rHbjMF\nH0pTf7KlgCDxEjRkmm3jRmr+hgWYFIJ1XB0ju/E06ppFnuQeRuCPGTdfx31nBii3\n1bwPkAgRRGGuchA7ekNms5kQ94UOCkThEcotpwS0VzOLfjV6c5+sF1o3crvbeMZy\nAC2LRZAQ2uY2Ls+vjbFkqZi0XKbfziDKr40myIg7v8URIcM+yQWSwka0PELf3Msa\nme7ZNlDdUKdyvkJ3y+IJhyrw7q6l/U/2hd3OHlbtFH0kF3vtcqD7pefE1jr+HpT7\nB8Km2CVxAgMBAAECggEAAwniXqfY23QyzF6+CrEim2HQp89CdXksKSH+FIdilhl4\npCX0FAaR23EuN9uNMwDl6wIZMrfjQk+LQCdt0metpG37NNVhnET8gcJRXDiAB52e\ntwmXGhX++zPixclk1aID2rDqkEq49V1ncV90M4HGtAQGzLXBM5un8HZsL1SKQxYL\nRurlKuGpfCfaM5z5h4j1PyHQedUaQwGgjg/SBkQ6lRatqoNeTgYXU4CSQYhd9mR6\n3WZ/h/kjTqVPvDi9pgICnYZL8s0NKtFEBZ54PC7EQzuslDChr0X1whf8sWnFPBdC\nKyfCUHeKU3V+t6cQlhIFapqecVXozTeqz3DwrjwBCQKBgQDHnBvlMiEDPn1Y8cOs\nDXClGDjNQJ3k41OfBT4pbRwx/GOK9DUFq+vcn1qXKlUUvvRzbosCkPxxLZlvdaYS\njzr2zD4+ENGe3kUWUtBOW9X9xhA+A2S5f4H7UX1zdKYQzvSVj5nCfbqwlwL5QKxS\nhlA2RQ1lLsYUC3qC5VP4HolVCQKBgQC3ykJ+BTQY76zKsdRNOrijp3RrLatNom7g\nsddY0jE5i6ISekW45sBe3885J7lqVaP/f8TZtsPRRlycHMP/lEim+5aHsA8QoSQ6\ndHl+eQArqtNLdGxTZtdsnZpY+YnfhIy+p7CV31OXahEFqzmP2gX63gNICO4RmchJ\nysUQBW4PKQKBgFdgbpWVq/3PjO8yZYUbHQQn5jVy46seF6y0jtFzgbQf1zMsU0l4\nSHb7CpzBWx0JudgNu6wT621fmJrB1UCqkhUWsuhYVGpGwddTyPuEF9hOqy16Ls1E\nk5F/ynqPxWH2NfqCMbyBbQeAEz0ookY9pT8cWxC/uNVtcON7n5YtR9CBAoGAVV7k\nJ/luy655CuYzgXQnVA1yrF5YVgV/j2vMZfus1dggfojBXjQBY5B+h0QGgngpZ4MI\nA0E8EDeoyPMrr8pHPRlcQMbtGIJhe62iybaW97Gv2DrKHquEoXVLvsya2HKPlff6\ntIM6Jvkj0whIAqP5ZyA9Ufaj7xUJzg0cIGcFSpECgYBT+nyFvLDlgKEAx1ZZwO7+\nFbqI23mi5d1IN7t5bd8wkBlWt8FFE4z4ib4MfbWoB6ddb1DaBGfVlG99WkSe0RTN\n+1R7Zmsn9UAQBAFazeJ4wtxADean8vbvZLOi/R2jE/cj2ydVJqUc3V7x3vsN/WVO\nYgRwz6RatWjfi4o4GzgzGA==\n-----END PRIVATE KEY-----\n",
        client_email: "slides-generator@gen-lang-client-0415376281.iam.gserviceaccount.com",
        client_id: "107405857372750572217",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/slides-generator%40gen-lang-client-0415376281.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
      },
      scopes: [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    const slides_service = google.slides({ version: 'v1', auth });
    const drive_service = google.drive({ version: 'v3', auth });

    // Create new presentation
    console.log('Creating new presentation...');
    const presentation = await slides_service.presentations.create({
      requestBody: {
        title: title || `AI Generated Presentation - ${new Date().toLocaleDateString()}`
      }
    });

    const presentationId = presentation.data.presentationId;
    console.log('Presentation created with ID:', presentationId);

    // Create additional slides if needed
    const requests = [];
    for (let i = 1; i < slides.length; i++) {
      requests.push({
        createSlide: {
          objectId: `slide_${i}`,
          slideLayoutReference: {
            predefinedLayout: 'TITLE_AND_BODY'
          }
        }
      });
    }

    if (requests.length > 0) {
      console.log('Creating additional slides...');
      await slides_service.presentations.batchUpdate({
        presentationId,
        requestBody: { requests }
      });
    }

    // Get updated presentation
    console.log('Getting updated presentation structure...');
    const updatedPresentation = await slides_service.presentations.get({
      presentationId
    });

    // Add content to slides
    const contentRequests = [];
    updatedPresentation.data.slides.forEach((slide, index) => {
      if (index < slides.length) {
        const slideData = slides[index];
        console.log(`Processing slide ${index + 1}: ${slideData.title}`);
        
        if (slide.pageElements) {
          slide.pageElements.forEach(element => {
            if (element.shape && element.shape.text && element.shape.placeholder) {
              const placeholder = element.shape.placeholder;
              
              if (placeholder.type === 'TITLE' || placeholder.type === 'CENTERED_TITLE') {
                contentRequests.push({
                  insertText: {
                    objectId: element.objectId,
                    text: slideData.title || `Slide ${index + 1}`,
                    insertionIndex: 0
                  }
                });
              } else if (placeholder.type === 'BODY' || placeholder.type === 'CONTENT') {
                const content = slideData.bulletPoints && slideData.bulletPoints.length > 0 
                  ? slideData.bulletPoints.map(point => `• ${point}`).join('\n')
                  : slideData.content || 'Content here';
                  
                contentRequests.push({
                  insertText: {
                    objectId: element.objectId,
                    text: content,
                    insertionIndex: 0
                  }
                });
              }
            }
          });
        }
      }
    });

    // Update slides with content
    if (contentRequests.length > 0) {
      console.log('Adding content to slides...');
      await slides_service.presentations.batchUpdate({
        presentationId,
        requestBody: { requests: contentRequests }
      });
    }

    // Set public permissions
    console.log('Setting presentation permissions...');
    try {
      await drive_service.permissions.create({
        fileId: presentationId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permError) {
      console.warn('Could not set public permissions:', permError.message);
    }

    const slideUrl = `https://docs.google.com/presentation/d/${presentationId}`;

    console.log('Google Slides presentation created successfully!');
    res.status(200).json({
      success: true,
      presentationId,
      slideUrl,
      slideCount: slides.length,
      message: 'Google Slides presentation created successfully!'
    });

  } catch (error) {
    console.error('Google Slides creation error:', error);
    
    // More detailed error handling
    let errorMessage = error.message;
    if (error.code === 403) {
      errorMessage = 'Authentication failed. Please check your Google API credentials.';
    } else if (error.code === 404) {
      errorMessage = 'Google Slides API not found. Please enable the API in Google Cloud Console.';
    } else if (error.message.includes('quota')) {
      errorMessage = 'API quota exceeded. Please try again later.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
