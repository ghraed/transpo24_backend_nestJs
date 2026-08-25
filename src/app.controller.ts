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
<title>Transpo24 account deletion</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#172033}h1{color:#111827}h2{margin-top:30px}li{margin:8px 0}.button{display:inline-block;margin:14px 0;padding:13px 18px;border-radius:999px;background:#ffc548;color:#111827;font-weight:700;text-decoration:none}</style></head>
<body><h1>Delete your Transpo24 account</h1>
<p>You can request deletion of a Transpo24 Customer or Driver account here without reinstalling the app. Email our support team from any email address you can access and include the phone number used to sign in and whether it is a customer or driver account.</p>
<p><a class="button" href="mailto:info@transpo24.ch?subject=Transpo24%20account%20deletion%20request&amp;body=Phone%20number%20used%20to%20sign%20in%3A%20%0AAccount%20type%20(customer%20or%20driver)%3A%20">Email an account deletion request</a></p>
<p>If you still have the app, you can also use <strong>Profile → Delete account</strong>.</p>
<p>We may request limited information to verify that the request belongs to you. We aim to complete verified requests within 30 days unless applicable law permits or requires more time.</p>
<h2>What is deleted</h2><p>We immediately delete or de-identify your profile details, phone number, login credentials, active sessions, device and push registrations, and driver identity and vehicle documents. Deletion cannot be undone.</p>
<h2>What we may retain</h2><p>We retain only de-identified transport, payment, payout, tax, dispute, and fraud-prevention records when required by law or necessary to resolve a transaction. These records are retained for up to seven years, then deleted according to our retention schedule.</p>
<p>Accounts with an active transport job must first complete or cancel that job so that customers and drivers are not left without the information needed to finish the service.</p>
<p>Questions can be sent to <a href="mailto:info@transpo24.ch">info@transpo24.ch</a>.</p>
</body></html>`;
  }
}
