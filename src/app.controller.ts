import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Public Google Play account-deletion URL. */
  @Get('account-deletion')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getAccountDeletionPage(): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transpo24 account deletion</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#172033}h1{color:#111827}h2{margin-top:30px}li{margin:8px 0}</style></head>
<body><h1>Delete your Transpo24 account</h1>
<p>You can request deletion of a Transpo24 Customer or Driver account directly in the app.</p>
<ol><li>Open Transpo24 and sign in with the phone number for the account.</li><li>Open <strong>Profile</strong>.</li><li>Select <strong>Delete account</strong> and confirm the permanent deletion.</li></ol>
<p>If you cannot sign in, request a new SMS code for the same phone number, then follow the steps above. This prevents another person from deleting your account.</p>
<h2>What is deleted</h2><p>We immediately delete or de-identify your profile details, phone number, login credentials, active sessions, device and push registrations, and driver identity and vehicle documents. Deletion cannot be undone.</p>
<h2>What we may retain</h2><p>We retain only de-identified transport, payment, payout, tax, dispute, and fraud-prevention records when required by law or necessary to resolve a transaction. These records are retained for up to seven years, then deleted according to our retention schedule.</p>
<p>Accounts with an active transport job must first complete or cancel that job so that customers and drivers are not left without the information needed to finish the service.</p>
</body></html>`;
  }
}
