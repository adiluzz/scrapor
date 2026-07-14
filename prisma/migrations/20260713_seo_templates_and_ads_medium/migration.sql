-- SEO page templates + Medium monetization ad slots
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoVideoTitleTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoVideoDescTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoPornstarTitleTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoPornstarDescTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoTagTitleTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoTagDescTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoCreatorTitleTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoCreatorDescTpl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoTagsIndexTitle" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoTagsIndexDesc" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoPornstarsIndexTitle" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoPornstarsIndexDesc" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoCreatorsIndexTitle" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "seoCreatorsIndexDesc" TEXT;

ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneGridNative" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneMobileSticky" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZonePopunder" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "exoZoneMidList" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsSiteId" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsZoneBanner" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "juicyAdsZoneNative" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "stripchatWidgetId" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "stripchatAffiliateUrl" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adsPopunderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adsJuicyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "adsCamWidgetEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Niche SEO defaults (Pisshamster-style for Pisster; FBB / Sharlila matrices)
UPDATE "Site" SET
  "seoTitle" = 'Peeing & Piss Drinking Porn Videos | Pisster',
  "seoDescription" = 'Watch free HD piss drinking porn on Pisster. Golden shower, pee drinking, piss swallowing, lesbian peeing & watersports videos updated daily. Stream full-length urine fetish scenes in 720p and 1080p.',
  "homeH1" = 'Pissing & Piss Drinking Porn Videos',
  "homeIntroHtml" = '<p>Pisster is a free HD tube for piss drinking, golden shower, and watersports porn. Stream pee drinking, piss swallowing, and urine fetish scenes updated daily.</p><p>Browse tags like <a href="/tags/piss-swallow">piss swallow</a> and explore pornstars who love pissing porn.</p><p>All videos stream free in HD. New pissing and watersports clips added regularly.</p>',
  "ogImagePath" = '/brand/pisster-lockup.svg',
  "seoVideoTitleTpl" = '{title} | Pisster',
  "seoVideoDescTpl" = 'Watch {title} on Pisster — free HD piss drinking, golden shower & watersports porn.',
  "seoPornstarTitleTpl" = '{name} Piss Drinking & Golden Shower Videos | Pisster',
  "seoPornstarDescTpl" = '{name} pissing and piss drinking videos on Pisster. Watch {name} in golden shower & watersports scenes.',
  "seoTagTitleTpl" = '{name} Pissing & Piss Drinking Videos | Pisster',
  "seoTagDescTpl" = 'Watch free {name} pissing and watersports videos on Pisster. Golden shower, pee drinking & HD urine fetish scenes.',
  "seoTagsIndexTitle" = 'Pissing & Watersports Video Tags | Pisster',
  "seoTagsIndexDesc" = 'Browse pissing, golden shower, and piss drinking tags on Pisster. Narrow by fetish — pee drinking, outdoor pissing, femdom piss, and more.',
  "seoPornstarsIndexTitle" = 'Pornstars That Love Piss | Pisster',
  "seoPornstarsIndexDesc" = 'Pornstars in piss drinking, golden shower, and watersports videos. Browse performers who film pissing porn on Pisster.',
  "seoKeywords" = '["piss drinking porn","piss drinking videos","pee drinking porn","golden shower videos","watersports porn","urine fetish","piss swallowing","piss in mouth","piss drinking tube","free piss drinking porn","HD piss drinking","lesbian piss drinking","piss drinking compilation","omorashi","pee fetish","peeing porn","pissing porn","golden shower","pee desperation","human toilet","toilet slave","femdom piss","self pissing","piss on jeans","outdoor pissing"]'
WHERE "domain" = 'pisster.com';

UPDATE "Site" SET
  "seoTitle" = 'Female Bodybuilder Porn & Muscle Worship Videos | FBB Tube',
  "seoDescription" = 'Free HD female bodybuilder porn on FBB Tube. Muscle worship, ripped women, fbb erotica, fitness fetish & female muscle videos — stream scenes featuring strong women.',
  "homeH1" = 'Female Bodybuilder Porn Videos',
  "homeIntroHtml" = '<p>FBB Tube is the home of free HD female bodybuilder porn and muscle worship. Stream fbb erotica, fitness fetish, and female muscle scenes featuring ripped women.</p><p>Browse tags and pornstars for muscle girls, flex clips, and amazonian performers.</p><p>Updated regularly — all videos stream free in HD.</p>',
  "ogImagePath" = '/brand/fbbtube-lockup.svg',
  "seoVideoTitleTpl" = '{title} | FBB Tube',
  "seoVideoDescTpl" = 'Watch {title} on FBB Tube — free HD female bodybuilder & muscle worship porn.',
  "seoPornstarTitleTpl" = '{name} Female Bodybuilder Videos | FBB Tube',
  "seoPornstarDescTpl" = '{name} FBB and muscle worship videos on FBB Tube. Watch {name} in female bodybuilder scenes.',
  "seoTagTitleTpl" = '{name} Female Bodybuilder & Muscle Videos | FBB Tube',
  "seoTagDescTpl" = 'Watch free {name} female bodybuilder and muscle worship videos on FBB Tube.',
  "seoTagsIndexTitle" = 'FBB & Muscle Fetish Video Tags | FBB Tube',
  "seoTagsIndexDesc" = 'Browse female bodybuilder and muscle worship tags on FBB Tube — fbb, fitness fetish, female muscle, and more.',
  "seoPornstarsIndexTitle" = 'Female Bodybuilders & Muscle Pornstars | FBB Tube',
  "seoPornstarsIndexDesc" = 'Browse FBB pornstars and muscular women. Watch female bodybuilders in muscle worship videos on FBB Tube.',
  "seoKeywords" = '["female bodybuilder porn","fbb porn","muscle worship","female muscle","fitness fetish","bodybuilder women","fbb tube","female bodybuilder videos","ripped women porn","muscle girl porn","fbb erotica","female muscle worship","amazonian women","muscle milf","flex porn"]'
WHERE "domain" = 'fbbtube.com';

UPDATE "Site" SET
  "seoTitle" = 'Sharlila Productions — Adult Film Studio',
  "seoDescription" = 'Sharlila is an adult film production company. Contact the studio and explore our specialty tubes across the Sharlila network.',
  "homeH1" = 'Sharlila Productions',
  "homeIntroHtml" = '<p>Sharlila is an adult film production company. Contact us for collaborations, or explore our network of specialty tubes.</p><p><a href="/contact">Contact</a> · <a href="/our-network">Our Network</a></p>',
  "ogImagePath" = '/brand/sharlila-lockup.svg',
  "seoCreatorTitleTpl" = '{name} · Sharlila Productions',
  "seoCreatorDescTpl" = '{name} videos and productions from Sharlila.',
  "seoCreatorsIndexTitle" = 'Creators · Sharlila Productions',
  "seoCreatorsIndexDesc" = 'Independent creators and productions on Sharlila.',
  "seoKeywords" = '["sharlila","adult studio","porn production","adult film production","adult network"]'
WHERE "domain" = 'sharlila.com';
