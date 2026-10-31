# SENTRIX — kurulum

## Back4App istemci ayarları
Kök `back4app-config.js` ve `public/js/back4app-config.js` dosyaları SENTRIX için verilen Application ID ve JavaScript Key ile yapılandırılmıştır. Bunlar tarayıcıda kullanılabilen istemci anahtarlarıdır. **Master Key'i hiçbir zaman GitHub'a veya tarayıcıya koymayın.**

## Cloud Code
`cloud/main.js` dosyasını Back4App Cloud Code ana dosyası olarak deploy edin. GitHub'a commit etmek Back4App sunucusuna otomatik deploy yapmaz. Deploy sonrasında Cloud Code loglarını kontrol edin.

## Alan adı doğrulama
Kullanıcıya verilen dosyayı şu yola yükleyin:
`https://alanadiniz/.well-known/sentrix-verification.txt`
Dosyanın içeriği panelde gösterilen `sentrix-verification=TOKEN` satırıyla birebir aynı olmalıdır. Domain sahipliği uygulama sorgusuyla kontrol edilir. Eşzamanlı claim yarışlarını kesin olarak engellemek için Back4App veritabanında SxDomain.host alanına unique index ekleyin; Parse sorgu-önce-kaydet akışı tek başına yarış koşuluna karşı kesin tekillik garantisi vermez.

## Gerçek veri entegrasyonları
Cloud Code olay kayıt uçları sağlar. Ancak tarayıcı snippet'inin gerçek veri göndermesi için ayrıca yayımlanmış tracker.js servisi gerekir; henüz bu depoda tracker servisi yoktur. Google Search Console verisi OAuth ve Search Console API, WAF olayları ise güvenli sunucu tarafı webhook'u ve SENTRIX_WAF_INGEST_TOKEN yapılandırması gerektirir. Bu bağlantılar olmadan arayüz gerçek dışı veri göstermemelidir.

## Yayın ve test
1. Statik siteyi GitHub Pages/Vercel üzerinde yayımla.
2. Cloud Code'u Back4App'e ayrıca deploy et.
3. Yeni test hesabıyla kayıt/giriş, domain doğrulama ve event ingest akışlarını test et.
4. Master Key, WAF tokenı veya başka sunucu sırlarını istemci dosyalarına ekleme.
