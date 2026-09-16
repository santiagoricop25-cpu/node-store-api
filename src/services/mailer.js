const nodemailer = require('nodemailer');

// Si no configuras SMTP_* en el .env, los correos simplemente se imprimen
// en los logs — así puedes probar todo el flujo de registro/login antes
// de tener un proveedor de correo real conectado.
const hasSmtp = !!process.env.SMTP_HOST;

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;

async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log(`\n[mailer] (SMTP no configurado — mostrando el correo aquí)\nPara: ${to}\nAsunto: ${subject}\n${html}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Node Store <no-reply@ricops.com>',
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(to, verifyUrl) {
  await sendMail({
    to,
    subject: 'Confirma tu correo — Node Store',
    html: `
      <p>Gracias por crear tu cuenta en Node Store.</p>
      <p><a href="${verifyUrl}">Haz clic aquí para confirmar tu correo</a> (el enlace expira en 24 horas).</p>
      <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
    `,
  });
}

async function sendPasswordResetEmail(to, resetUrl) {
  await sendMail({
    to,
    subject: 'Restablece tu contraseña — Node Store',
    html: `
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Haz clic aquí para elegir una nueva contraseña</a> (el enlace expira en 1 hora).</p>
      <p>Si no fuiste tú, ignora este mensaje — tu contraseña actual sigue siendo válida.</p>
    `,
  });
}

async function sendOrderStatusEmail(to, { orderId, status, trackingNumber, carrier }) {
  const labels = {
    paid: 'Confirmamos tu pago',
    shipped: 'Tu pedido fue enviado',
    delivered: 'Tu pedido fue entregado',
    cancelled: 'Tu pedido fue cancelado',
  };
  const tracking = trackingNumber
    ? `<p>Número de guía: <b>${trackingNumber}</b>${carrier ? ` (${carrier})` : ''}</p>`
    : '';
  await sendMail({
    to,
    subject: `${labels[status] || 'Actualización de tu pedido'} — Node Store`,
    html: `
      <p>${labels[status] || 'Tu pedido cambió de estado'}.</p>
      <p>Pedido: <b>${orderId}</b></p>
      ${tracking}
    `,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail, sendOrderStatusEmail };
