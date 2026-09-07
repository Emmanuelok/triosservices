import type { Metadata } from "next";

export const siteOrigin = "https://triosservices.vercel.app";
export const socialTitle = "Trios Snow and Mowing Inc. | Property care, all year";
export const socialDescription = "Snow clearing, lawn care and seasonal property services in St. John's. Request a quote, build your care plan and manage your property with Trios Snow and Mowing Inc.";
export const socialImage = {
  url: "/og/trios-property-care-v1.jpg",
  width: 1200,
  height: 630,
  alt: "Trios Snow and Mowing Inc. — Every season. Beautifully cared for. Winter snow clearing and summer lawn care in St. John’s, Newfoundland.",
};

export const socialOpenGraph: NonNullable<Metadata["openGraph"]> = {
  type: "website",
  locale: "en_CA",
  siteName: "Trios Snow and Mowing Inc.",
  title: socialTitle,
  description: socialDescription,
  images: [{ ...socialImage, type: "image/jpeg" }],
};
