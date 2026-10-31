# SENTRIX — kurulum ve dağıtım

## 1. Back4App istemci ayarları
`back4app-config.js` ve `public/js/back4app-config.js` içinde verilen public Application ID ve JavaScript Key kullanılır. Bunlar istemci anahtarıdır. **Master Key veya WAF tokenını frontend'e/GitHub'a koymayın.**

## 2. Cloud Code dağıtımı ve merkezi şema kaydı
`cloud/main.js` dosyasını Back4App uygulamasının Cloud Code ana dosyası olarak yükleyip deploy edin. GitHub commit'i Back4App'e otomatik dağıtım yapmaz.

`SENTRIX_FEATURE_REGISTRY`, bütün modüllerin kalıcı veri gereksinimlerinin merkezi kaynağıdır. Şu anki site işlevleri için hesap profili (`_User.name`), alan adı/varlık yönetimi, analitik, güvenlik/audit kayıtları ve değerlendirme talepleri tanımlıdır. Sistem var olan şemayı okur; eksik alanları ve indeksleri ekler; eksik özel sınıfları oluşturur; özel sınıfların istemci CLP izinlerini kapalı tutar. Var olan alanları/sınıfları/satırları silmez. Alan türü uyuşmazlığında veriyi riske atmamak için sessizce dönüştürmek yerine hata verir.

Parse'ın `_User` ve `_Session` sınıfları yeniden oluşturulmaz. `_User` yalnızca `name` alanı eksikse genişletilir; giriş, şifre, e-posta ve oturum yaşam döngüsü Parse tarafından yönetilmeye devam eder. Yeni bir özellik eklendiğinde `SENTRIX_FEATURE_REGISTRY` içine özellik adı, sınıfları, alan tipleri, Pointer/Relation hedefleri, indeksleri ve erişim politikasını ekleyin. Ardından `sentrixBootstrap` Cloud Job yeniden çalıştırılabilir. Gelecekteki bir özelliğin kayıt defterine eklenmeden kendiliğinden tahmin edilmesi garanti edilmez.

Deploy sonrası `sentrixHealth`, kayıt/giriş, alan adı oluşturma/listeleme/doğrulama ve özet fonksiyonlarını test edin. Cloud Job kodda tanımlanır; otomatik periyodik çalışması için Back4App panelinde uygun zamanlama ayrıca yapılandırılmalıdır.

## 3. Alan adı doğrulama
Panelin ürettiği `sentrix-verification=TOKEN` metnini şu dosyaya aynen yükleyin:
`https://alanadiniz/.well-known/sentrix-verification.txt`
Doğrulama yalnızca HTTPS üzerinden yapılır. Başarılı doğrulama olmadan izleme kodu verilmez.

### Eşzamanlı alan adı sahiplenme koruması
Cloud Code tarafındaki sorgu-önce-kaydet kontrolü tek başına eşzamanlı isteklerde atomik değildir. Back4App'in kullandığı MongoDB veritabanında **SxDomain.host için unique index** oluşturulmalıdır. MongoDB yönetim konsolunda, doğru database seçiliyken:
```javascript
db.SxDomain.createIndex({ host: 1 }, { unique: true, name: "uniq_sentrix_domain_host" })
```
Mevcut tekrarlı host kayıtları varsa indeks oluşturulmadan önce temizlenmelidir. İndeks oluşturma yetkisi/erişimi Back4App planına ve veritabanı yönetim yöntemine bağlıdır. Bu indeks kurulmadan mutlak tekillik garantisi verilmez.

## 4. Tarayıcı izleme servisi
`tracker.js` dosyası GitHub'da yayımlanır. Cloud Code doğrulama sonrası jsDelivr CDN adresini içeren snippet üretir. CDN'nin yeni commit'i sunması kısa süre önbelleğe takılabilir. Test için önce bir alan adını doğrulayın, kodu siteye ekleyin, ardından panelde sayfa görüntülemeyi kontrol edin.

İzleme kodu sayfa yolu, yönlendiren sayfa ve oturum kapsamlı rastgele ziyaretçi kimliği gönderir. Tarayıcı tarafı olaylar manipüle edilebilir; kritik güvenlik telemetrisi olarak değerlendirilmemelidir. KVKK/çerez yükümlülükleri, bilgilendirme ve gerekiyorsa izin yönetimi site sahibinin sorumluluğundadır.

## 5. Google Search Console
Arama sorguları/performansı için Google Cloud projesi, Search Console API etkinleştirme, OAuth istemcisi, yetkilendirme yönlendirme URI'leri ve kullanıcı bazlı OAuth token saklama akışı gerekir. Bu bilgiler henüz sağlanmadığı için bağlantı etkin değildir; SENTRIX sahte sorgu verisi göstermez.

## 6. WAF / CDN olayları
`sentrixIngestSecurityEvent` sunucu taraflı olay alımı içindir. Back4App **Config** bölümüne `SENTRIX_WAF_INGEST_TOKEN` anahtarı ekleyin. Tokenı yalnızca güvenilir WAF webhook aracınızın sunucu tarafında saklayın; tarayıcıya koymayın. Webhook, doğrulanmış siteId ile olay gönderir. WAF sağlayıcısının imza doğrulaması/secret doğrulaması entegrasyon katmanında ayrıca uygulanmalıdır. Bu repo belirli bir WAF sağlayıcısına bağlanmış değildir.

## 7. Logo ve arama motoru yapılandırılmış verisi
Sitedeki favicon, üst menü logosu ve ana görsel `assets/sentrix-logo.svg` dosyasını kullanır. `index.html` içindeki `SoftwareApplication` JSON-LD aynı logo dosyasını, yayınlandığı sitenin gerçek `location.origin` adresiyle mutlak URL'ye dönüştürerek bildirir. Böylece sabit/yanlış bir Vercel alan adı varsayılmaz. Siteyi yayımladıktan sonra kaynak kodunda JSON-LD'nin üretildiğini ve logo URL'sinin herkese açık açıldığını doğrulayın.

## 8. Dağıtım kontrol listesi
- [ ] Statik siteyi Vercel veya GitHub Pages üzerinde yayımla.
- [ ] Yayındaki sayfada SENTRIX SVG logosunun ve JSON-LD yapılandırılmış verisinin aynı SVG dosyasını gösterdiğini doğrula.
- [ ] Back4App Cloud Code deploy sonrası `sentrixBootstrap` işini çalıştır ve raporda tüm kayıtlı şemaların başarıyla kontrol edildiğini doğrula.
- [ ] Cloud Code'u Back4App'e ayrıca deploy et.
- [ ] SxDomain.host unique index'i kur.
- [ ] Yeni kullanıcıyla kayıt ve giriş dene.
- [ ] Test alan adında doğrulama dosyasını yayımla ve doğrula.
- [ ] Tracker snippet'ini ekle ve gerçek sayfa görüntülemesini doğrula.
- [ ] Search Console OAuth ve WAF webhook bağlantılarını ayrı ayrı kurup test et.
- [ ] KVKK aydınlatma ve izin mekanizmasını değerlendir.

**Durum:** Frontend ve temel tracker kaynak kodu repodadır; bunların canlı ortamda çalıştığı, Cloud Code deploy edildiği, MongoDB unique index kurulduğu veya Google/WAF entegrasyonlarının etkin olduğu anlamına gelmez. Canlı uçtan uca test ve dış servis yapılandırması tamamlanmadan sistem üretim için hazır kabul edilmemelidir.
