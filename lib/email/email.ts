import { Resend } from 'resend';
import { downloadPDF } from '@/lib/r2/r2';

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.warn('RESEND_API_KEY is not defined in environment variables.');
}

const resend = new Resend(resendApiKey || 're_placeholder');

interface SendReportEmailParams {
  recipientEmail: string;
  recipientName: string;
  agencyName: string;
  clientName: string;
  periodText: string;
  customMessage?: string;
  pdfKey: string;
  signedUrl: string;
  brandPrimaryColor?: string;
}

/**
 * Sends a branded report HTML email via Resend with the PDF attached.
 */
export async function sendReportEmail({
  recipientEmail,
  recipientName,
  agencyName,
  clientName,
  periodText,
  customMessage,
  pdfKey,
  signedUrl,
  brandPrimaryColor = '#0EA5E9',
}: SendReportEmailParams): Promise<{ success: boolean; messageId?: string }> {
  // 1. Download PDF buffer from R2
  const pdfBuffer = await downloadPDF(pdfKey);

  // 2. Format subject line
  const subject = `${agencyName} — ${clientName} Performance Report (${periodText})`;

  // 3. Render branded HTML template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: ${brandPrimaryColor};
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .content {
            padding: 32px;
            line-height: 1.6;
          }
          .content h2 {
            font-size: 18px;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 16px;
          }
          .content p {
            font-size: 14px;
            color: #475569;
            margin-top: 0;
            margin-bottom: 24px;
          }
          .custom-msg {
            background-color: #f1f5f9;
            border-left: 4px solid ${brandPrimaryColor};
            padding: 16px;
            border-radius: 4px;
            margin-bottom: 24px;
            font-style: italic;
          }
          .btn-container {
            text-align: center;
            margin-bottom: 32px;
          }
          .btn {
            background-color: ${brandPrimaryColor};
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 14px;
            display: inline-block;
          }
          .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${agencyName}</h1>
          </div>
          <div class="content">
            <h2>Monthly Performance Report</h2>
            <p>Hi ${recipientName},</p>
            <p>Your digital marketing performance report for <strong>${clientName}</strong> covering the period of <strong>${periodText}</strong> is ready for review.</p>
            
            ${customMessage ? `<div class="custom-msg">"${customMessage}"</div>` : ''}
            
            <p>A PDF copy has been attached to this email. You can also view the interactive digital version online by clicking the link below (valid for 72 hours):</p>
            
            <div class="btn-container">
              <a href="${signedUrl}" class="btn" target="_blank">View Performance Report</a>
            </div>
            
            <p>Best regards,<br><strong>${agencyName} Team</strong></p>
          </div>
          <div class="footer">
            <p>This email was sent via ReportAI. Performance data is loaded directly from active advertising and analytics channels.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  // 4. Send email with PDF attachment using Resend
  // Note: Resend Free Tier only permits sending to the registered single domain or sandbox owner.
  // We use the configured from address or standard sandbox.
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'ReportAI <onboarding@resend.dev>';

  const response = await resend.emails.send({
    from: fromEmail,
    to: [recipientEmail],
    subject: subject,
    html: htmlContent,
    attachments: [
      {
        filename: `${clientName.replace(/\s+/g, '_')}_Performance_Report.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (response.error) {
    throw new Error(`Resend API Error: ${response.error.message}`);
  }

  return {
    success: true,
    messageId: response.data?.id,
  };
}
