import { AuthenticatedRequest, AppServer } from '@mentra/sdk';
import express from 'express';
import path from 'path';

/**
 * Sets up all Express routes and middleware for the server
 * @param server The server instance
 */
export function setupExpressRoutes(server: AppServer): void {
  // Get the Express app instance
  const app = server.getExpressApp();

  // Set up EJS as the view engine
  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs').__express);
  app.set('views', path.join(__dirname, 'views'));

  // Register a route for handling webview requests
  const webviewHandler: express.RequestHandler = (req, res) => {
    const authReq = req as unknown as AuthenticatedRequest;
    if (authReq.authUserId) {
      // Render the webview template
      res.render('webview', {
        userId: authReq.authUserId,
      });
    } else {
      res.render('webview', {
        userId: undefined,
      });
    }
  };

  app.get('/webview', webviewHandler);
}
