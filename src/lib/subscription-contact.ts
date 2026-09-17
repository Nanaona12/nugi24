export const SUBSCRIPTION_ADMIN_WHATSAPP = "6285163585905";

export function subscriptionWhatsAppUrl(details: {
  orderId: string;
  plan: string;
  period: string;
}) {
  const periodLabel = details.period === "yearly" ? "tahunan" : "bulanan";
  const message = [
    "Halo Admin, pembayaran langganan QRIS saya sudah berhasil.",
    `Order: ${details.orderId}`,
    `Paket: ${details.plan} (${periodLabel})`,
    "Mohon diproses lebih lanjut. Terima kasih.",
  ].join("\n");

  return `https://wa.me/${SUBSCRIPTION_ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
}