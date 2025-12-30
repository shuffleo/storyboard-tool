// Google Drive integration service
// Handles authentication, Google Sheets sync, and Drive folder/image management

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface GoogleDriveConfig {
  apiKey: string;
  clientId: string;
  discoveryDocs: string[];
  scopes: string;
}

// You'll need to set these in your environment or config
// For now, using placeholder values - user will need to configure
const GOOGLE_CONFIG: GoogleDriveConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4', 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
};

class GoogleDriveService {
  private isInitialized = false;
  private isSignedIn = false;
  private tokenClient: any = null;
  private accessToken: string | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Check if API credentials are configured
    if (!GOOGLE_CONFIG.apiKey || !GOOGLE_CONFIG.clientId) {
      throw new Error(
        'Google Drive API credentials not configured. Please set VITE_GOOGLE_API_KEY and VITE_GOOGLE_CLIENT_ID environment variables. See README.md for setup instructions.'
      );
    }

    return new Promise((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error('Google APIs not loaded. Make sure the Google APIs scripts are included in index.html.'));
        return;
      }

      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init(GOOGLE_CONFIG);
          this.isInitialized = true;

          // Initialize Google Identity Services
          if (window.google) {
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CONFIG.clientId,
              scope: GOOGLE_CONFIG.scopes,
              callback: (response: any) => {
                if (response.error) {
                  console.error('Google auth error:', response.error);
                  this.isSignedIn = false;
                  return;
                }
                this.accessToken = response.access_token;
                this.isSignedIn = true;
                window.gapi.client.setToken({ access_token: response.access_token });
              },
            });
          } else {
            reject(new Error('Google Identity Services not loaded. Make sure the Google Identity Services script is included in index.html.'));
            return;
          }

          resolve();
        } catch (error) {
          console.error('Failed to initialize Google APIs:', error);
          reject(error);
        }
      });
    });
  }

  async signIn(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.tokenClient) {
      throw new Error('Google Identity Services not initialized');
    }

    return new Promise((resolve) => {
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
      
      // Check if already signed in
      const checkInterval = setInterval(() => {
        if (this.isSignedIn && this.accessToken) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(this.isSignedIn);
      }, 10000);
    });
  }

  async signOut(): Promise<void> {
    if (window.google && this.tokenClient) {
      window.google.accounts.oauth2.revoke(this.accessToken, () => {
        this.isSignedIn = false;
        this.accessToken = null;
        window.gapi.client.setToken(null);
      });
    }
  }

  isConnected(): boolean {
    return this.isSignedIn && !!this.accessToken;
  }

  // Create or get Google Sheet for project data
  async getOrCreateSheet(projectTitle: string): Promise<string> {
    if (!this.isSignedIn) throw new Error('Not signed in to Google');

    // Search for existing sheet
    const response = await window.gapi.client.drive.files.list({
      q: `name='${projectTitle} - Storyboard' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id;
    }

    // Create new sheet
    const createResponse = await window.gapi.client.sheets.spreadsheets.create({
      properties: {
        title: `${projectTitle} - Storyboard`,
      },
    });

    return createResponse.result.spreadsheetId;
  }

  // Sync project data to Google Sheets
  async syncToSheets(projectData: any): Promise<void> {
    if (!this.isSignedIn) throw new Error('Not signed in to Google');

    const sheetId = await this.getOrCreateSheet(projectData.project.title);

    // Prepare data for sheets
    const headers = ['Shot Code', 'Scene', 'Script Text', 'General Notes', 'Tags'];
    const rows = projectData.shots.map((shot: any) => {
      const scene = projectData.scenes.find((s: any) => s.id === shot.sceneId);
      return [
        shot.shotCode,
        scene ? `${scene.sceneNumber}: ${scene.title || `Scene ${scene.sceneNumber}`}` : 'Unassigned',
        shot.scriptText || '',
        shot.generalNotes || '',
        shot.tags.join(', ') || '',
      ];
    });

    // Clear existing data and write new data
    await window.gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:Z1000',
    });

    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      values: [headers, ...rows],
    });
  }

  // Get or create folder for scene images
  async getOrCreateSceneFolder(projectTitle: string, sceneNumber: string, sceneTitle: string): Promise<string> {
    if (!this.isSignedIn) throw new Error('Not signed in to Google');

    const folderName = `Scene ${sceneNumber}: ${sceneTitle || `Scene ${sceneNumber}`}`;
    const parentFolderName = `${projectTitle} - Images`;

    // Get or create parent folder
    let parentFolderId: string | null = null;
    const parentResponse = await window.gapi.client.drive.files.list({
      q: `name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (parentResponse.result.files && parentResponse.result.files.length > 0) {
      parentFolderId = parentResponse.result.files[0].id;
    } else {
      const createParentResponse = await window.gapi.client.drive.files.create({
        resource: {
          name: parentFolderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      parentFolderId = createParentResponse.result.id;
    }

    // Get or create scene folder
    const sceneResponse = await window.gapi.client.drive.files.list({
      q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (sceneResponse.result.files && sceneResponse.result.files.length > 0) {
      return sceneResponse.result.files[0].id;
    }

    const createSceneResponse = await window.gapi.client.drive.files.create({
      resource: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });

    return createSceneResponse.result.id;
  }

  // Upload image to Google Drive scene folder
  async uploadImageToDrive(
    projectTitle: string,
    sceneNumber: string,
    sceneTitle: string,
    imageData: string,
    fileName: string
  ): Promise<string> {
    if (!this.isSignedIn) throw new Error('Not signed in to Google');

    const folderId = await this.getOrCreateSceneFolder(projectTitle, sceneNumber, sceneTitle);

    // Convert base64 to blob
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Upload file
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error('Failed to upload image to Google Drive');
    }

    const result = await response.json();
    return result.id;
  }

  // Sync all project data to Google Drive
  async syncProject(projectData: any): Promise<void> {
    if (!this.isSignedIn) throw new Error('Not signed in to Google');

    try {
      // Sync to Google Sheets
      await this.syncToSheets(projectData);

      // Sync images to Drive folders
      for (const frame of projectData.frames) {
        const shot = projectData.shots.find((s: any) => s.id === frame.shotId);
        if (!shot) continue;

        const scene = projectData.scenes.find((s: any) => s.id === shot.sceneId);
        if (!scene) continue;

        const fileName = `shot-${shot.shotCode}-frame-${frame.orderIndex}.png`;
        await this.uploadImageToDrive(
          projectData.project.title,
          scene.sceneNumber,
          scene.title,
          frame.image,
          fileName
        );
      }
    } catch (error) {
      console.error('Error syncing to Google Drive:', error);
      throw error;
    }
  }
}

export const googleDriveService = new GoogleDriveService();

