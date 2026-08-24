import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('account deletion page', () => {
    it('allows a user to request deletion without the app', () => {
      const page = appController.getAccountDeletionPage();

      expect(page).toContain('mailto:info@transpo24.com');
      expect(page).toContain('within 30 days');
      expect(page).toContain('up to seven years');
    });
  });
});
