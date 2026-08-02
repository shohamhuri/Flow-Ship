import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
} from '@angular/core'; import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';

  isSubmitting = false;
  errorMessage = '';

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,

  ) { }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.errorMessage =
        'יש להזין כתובת אימייל וסיסמה.';

      this.cdr.detectChanges();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    try {
      await this.authService.login(
        this.email.trim(),
        this.password,
      );

      await this.router.navigate([
        '/admin/home',
      ]);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : '';

      if (message === 'Invalid login credentials') {
        this.errorMessage =
          'כתובת האימייל או הסיסמה אינם נכונים.';
      } else {
        console.error(
          'Unexpected login error',
          error,
        );

        this.errorMessage =
          'אירעה שגיאה בהתחברות. נסי שוב.';
      }
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}