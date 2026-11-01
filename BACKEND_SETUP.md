# SENTRIX — kurulum ve dağıtım

## 1. Back4App istemci ayarları
`back4app-config.js` ve `public/js/back4app-config.js` içinde verilen public Application ID ve JavaScript Key kullanılır. Bunlar istemci anahtarıdır. **Master Key veya WAF tokenını frontend'e/GitHub'a koymayın.**

## 2. Cloud Code dağıtımı ve merkezi şema kaydı
`cloud/main.js` dosyasını Back4App uygulamasının Cloud Code ana dosyası olarak yükleyip deploy edin. GitHub commit'i Back4App'e otomatik dağıtım yapmaz.

`SENTRIX_FEATURE_REGISTRY`, bütün modüllerin kalıcı veri gereksinimlerinin merkezi kaynağıdır. Şu anki site işlevleri için hesap profili (`_User.name`), alan adı/varlık yönetimi, analitik, güvenlik/audit kayıtları ve değerlendirme talepleri tanımlıdır. Sistem var olan şemayı okur; eksik alanları ve indeksleri ekler; eksik özel sınıfları oluşturur; özel sınıfların istemci CLP izinlerini kapalı tutar. Var olan alanları/sınıfları/satırları silmez. Alan türü uyuşmazlığında veriyi riske atmamak için sessizce dönüştürmek yerine hata verir.

Parse'ın `_User` ve `_Session` sınıfları yeniden oluşturulmaz. `_User` yalnızca `name` alanı eksikse genişletilir; giriş, şifre, e-posta ve oturum yaşam döngüsü Parse tarafından yönetilmeye devam eder. Yeni bir özellik eklendiğinde `SENTRIX_FEATURE_REGISTRY` içine özellik adı, sınıfları, alan tipleri, Pointer/Relation hedefleri, indeksleri ve erişim politikasını ekleyin. Ardından `sentrixBootstrap` Cloud Job yeniden çalıştırılabilir. Gelecekteki bir özelliğin kayıt defterine eklenmeden kendiliğinden tahmin edilmesi garanti edilmez.

Deploy sonrası `sentrixHealth`, kayıt/giriş, alan adı oluşturma/listeleme/doğrulama ve özet fonksiyonlarını test edin. Cloud Job kodda tanımlanır; otomatik periyodik çalışması için Back4App panelinde uygun zamanlama ayrıca yapılandırılmalıdır.

## 3. Mülk ekleme ve dosya tabanlı sahiplik doğrulama
Panelden eklenen her mülk için sunucu benzersiz bir `.well-known/sentrix-verify-<siteId>.txt` dosya adı ve o mülke özel rastgele doğrulama içeriği üretir. Dosya tarayıcıdan otomatik indirilir. Kullanıcı dosyayı kendi GitHub Pages/Vercel projesindeki `.well-known/` klasörüne, verilen dosya adıyla ekleyip commit/publish eder. Ardından SENTRIX'te **Dosyayı kontrol et** seçeneğine basar.

Cloud Code canlı HTTPS sitesini sunucu tarafından gerçekten GET isteğiyle tarar; önce `/.well-known/<dosya>` yolunu, uyumluluk için ayrıca `/<dosya>` yolunu kontrol eder. Aynı alan adı üzerindeki HTTPS yönlendirmeleri sınırlı sayıda izlenir; başka alan adına yönlendirme ve yerel/özel IP hedefleri reddedilir. Dosyanın içeriği mülke özel token ile birebir karşılaştırılır (satır sonu boşlukları yok sayılır). Dosya yoksa veya içerik eşleşmiyorsa işlem başarısız olur ve mülk doğrulanmamış kalır. Başarılıysa mülkün durumu doğrulanır ve tracker snippet'i açılır. Her mülkün siteId'si ve doğrulama tokenı farklıdır; dosyalar birbirinin yerine kullanılamaz.

GitHub deposunda `.well-known` klasörü oluşturup dosyayı `.well-known/<dosya-adı>` yoluna ekleyin. Commit/push yaptıktan sonra GitHub Pages/Vercel gibi hosting sağlayıcısının siteyi gerçekten yayımlamasını bekleyin. Yalnızca GitHub deposuna yüklemek doğrulama için yeterli değildir; dosya canlı sitenin `https://alan-adin/.well-known/<dosya-adı>` adresinden açılmalıdır. Kontrol fonksiyonu depo içeriğini GitHub API üzerinden değil, alan adının yayınlanmış HTTPS adresinden tarar. Bu nedenle GitHub Pages/özel alan adı yayını doğru yapılandırılmalıdır.

Panelde **Mülklerim** listesinden bir mülke tıklayın. Mülk çalışma alanında sahiplik durumu, son 30 günlük sayfa görüntüleme/ziyaretçi sayıları, alınmış sayfa olayları, güvenlik olayları ve ilişkili varlıklar gösterilir. Tracker henüz eklenmediyse analitik bölümünde veri olmadığı açıkça belirtilir; sahte veri üretilmez.

## 4. GitHub depo sahipliği doğrulaması

SENTRIX'in GitHub doğrulaması, alan adı doğrulamasından ayrıdır. GitHub deposunun köküne rastgele bir dosya koymak tek başına depo sahibi olduğunu kanıtlamaz; katkıcılar da dosya ekleyebilir. Yeni akış GitHub Device Flow ile kullanıcıyı GitHub'da yetkilendirir ve GitHub API üzerinden giriş yapan hesabın kimliğini, depo sahibini ve depo izinlerini canlı olarak denetler.

### Bir defalık GitHub OAuth yapılandırması
1. GitHub Developer Settings > OAuth Apps bölümünden SENTRIX için bir OAuth App oluştur.
2. Application name ve Homepage URL alanlarını doldur. GitHub formu Authorization callback URL isterse SENTRIX'in ana adresini yaz; Device Flow bu callback adresine yönlendirme yapmaz.
3. OAuth App ayarlarında **Enable Device Flow** seçeneğini etkinleştir.
4. OAuth App'in **Client ID** değerini al.
5. Back4App > App Settings > Server Settings > Parse Config bölümüne şu anahtarları ekle:
   - `SENTRIX_GITHUB_CLIENT_ID`: GitHub OAuth App Client ID.
   - `SENTRIX_GITHUB_TOKEN_ENCRYPTION_KEY`: 64 karakterlik (32 bayt) rastgele hex anahtar. Güvenilir yerel bir ortamda `openssl rand -hex 32` ile üret.
6. Bu değerleri GitHub'a, `.env` dosyasına veya tarayıcı koduna ekleme. Client ID tek başına gizli değildir; şifreleme anahtarı kesinlikle gizli kalmalıdır.
7. Güncel `cloud/main.js` dosyasını Back4App Cloud Code'a yükle ve Deploy et.

**İzin kapsamı:** Device Flow şu an `repo` scope ister; bu, özel depolara erişim için gerekir ve GitHub tarafından geniş depo erişim izni olarak tanımlanır. Kullanıcı GitHub onay ekranında izinleri görür ve kendisi onaylar. Yalnızca herkese açık depoları desteklemek istersen kodda `scope:'repo'` yerine `scope:'public_repo'` kullan; bu durumda özel depolar doğrulanamaz.

### Kullanıcı akışı ve doğrulama ölçütü
1. SENTRIX kullanıcısı hesabına giriş yapar ve **GitHub hesabını bağla** seçeneğini seçer.
2. SENTRIX tek kullanımlık cihaz kodu üretir. Kullanıcı GitHub'ın resmi cihaz yetkilendirme sayfasında kodu onaylar ve SENTRIX'te yetkilendirmeyi kontrol eder.
3. Kullanıcı `https://github.com/owner/repository` biçiminde depo adresini girer.
4. Cloud Code, GitHub API `/user` ve `/repos/{owner}/{repo}` uç noktalarını OAuth token ile sorgular.
5. Kişisel depoda doğrulama için yetkilendirilmiş GitHub hesabı depo sahibi olmalı ve GitHub API `permissions.admin=true` döndürmelidir. Kuruluş deposunda kuruluşun depo üzerinde admin/yönetici izni aranır.
6. Yalnızca bu kontroller geçerse SENTRIX doğrulamayı başarılı kaydeder. Yazma/katkıcı (`push`) veya bakım (`maintain`) izni sahiplik doğrulaması değildir.
7. Başarısız kontrolde kayıt **DOĞRULANMADI** kalır; arayüz nedenini ve tespit edilen izni açıkça gösterir.

OAuth erişim tokenı tarayıcıya geri verilmez. Back4App'teki özel `SxGitHubConnection` sınıfında AES-256-GCM ile şifrelenerek saklanır; şifreleme anahtarı yalnızca Back4App Config'te tutulur. Cihaz kodu SENTRIX hesabına hash ile bağlanır ve süresi dolduğunda/başarıyla kullanıldığında temizlenir. Kullanıcı bağlantıyı keserse saklanan GitHub tokenı ve depo doğrulama kayıtları SENTRIX'ten silinir. GitHub tarafındaki OAuth izni otomatik iptal edilmez; tamamen kaldırmak için GitHub > Settings > Applications > Authorized OAuth Apps bölümünden SENTRIX iznini ayrıca iptal et.

**Doğrulamanın anlamı:** Kişisel depoda GitHub hesabının depo sahibi olduğu; kuruluş deposunda ise bağlanan hesabın depo yöneticisi olduğu doğrulanır. Kuruluş deposu için SENTRIX, kişiyi kuruluşun hukuki sahibi olarak değil, GitHub'daki yönetici yetkisine sahip hesap olarak tanımlar. GitHub OAuth izni iptal edilirse veya depo yetkileri değişirse sonraki canlı doğrulama başarısız olabilir. Kayıtlı sonuç son başarılı denetimin zamanını gösterir; değişen izinleri kendiliğinden izleyen sürekli bir izleme değildir.

## 5. Tarayıcı izleme servisi
`tracker.js` dosyası GitHub'da yayımlanır. Cloud Code doğrulama sonrası jsDelivr CDN adresini içeren snippet üretir. CDN'nin yeni commit'i sunması kısa süre önbelleğe takılabilir. Test için önce bir alan adını doğrulayın, kodu siteye ekleyin, ardından panelde sayfa görüntülemeyi kontrol edin.

İzleme kodu sayfa yolu, yönlendiren sayfa ve oturum kapsamlı rastgele ziyaretçi kimliği gönderir. Tarayıcı tarafı olaylar manipüle edilebilir; kritik güvenlik telemetrisi olarak değerlendirilmemelidir. KVKK/çerez yükümlülükleri, bilgilendirme ve gerekiyorsa izin yönetimi site sahibinin sorumluluğundadır.

## 6. Google Search Console
Arama sorguları/performansı için Google Cloud projesi, Search Console API etkinleştirme, OAuth istemcisi, yetkilendirme yönlendirme URI'leri ve kullanıcı bazlı OAuth token saklama akışı gerekir. Bu bilgiler henüz sağlanmadığı için bağlantı etkin değildir; SENTRIX sahte sorgu verisi göstermez.

## 7. WAF / CDN olayları
`sentrixIngestSecurityEvent` sunucu taraflı olay alımı içindir. Back4App **Config** bölümüne `SENTRIX_WAF_INGEST_TOKEN` anahtarı ekleyin. Tokenı yalnızca güvenilir WAF webhook aracınızın sunucu tarafında saklayın; tarayıcıya koymayın. Webhook, doğrulanmış siteId ile olay gönderir. WAF sağlayıcısının imza doğrulaması/secret doğrulaması entegrasyon katmanında ayrıca uygulanmalıdır. Bu repo belirli bir WAF sağlayıcısına bağlanmış değildir.

## 8. Logo ve arama motoru yapılandırılmış verisi
Sitedeki favicon, üst menü logosu ve ana görsel `assets/sentrix-logo.svg` dosyasını kullanır. `index.html` içindeki `SoftwareApplication` JSON-LD aynı logo dosyasını, yayınlandığı sitenin gerçek `location.origin` adresiyle mutlak URL'ye dönüştürerek bildirir. Böylece sabit/yanlış bir Vercel alan adı varsayılmaz. Siteyi yayımladıktan sonra kaynak kodunda JSON-LD'nin üretildiğini ve logo URL'sinin herkese açık açıldığını doğrulayın.

## 9. Hesap silme
Hesap yönetimi bölümündeki silme düğmesi kullanıcıdan `DELETE MY ACCOUNT` onayı ister. Cloud Function, kullanıcıya ait mülkleri, analitik/güvenlik/audit olaylarını, değerlendirmeleri ve varlık kayıtlarını temizledikten sonra Parse kullanıcısını siler. İşlem geri alınamaz. Back4App deploy edilmeden frontend'deki düğme sunucuda çalışmaz.

## 10. Dağıtım kontrol listesi
- [ ] Statik siteyi Vercel veya GitHub Pages üzerinde yayımla.
- [ ] Yayındaki sayfada SENTRIX SVG logosunun ve JSON-LD yapılandırılmış verisinin aynı SVG dosyasını gösterdiğini doğrula.
- [ ] Back4App Cloud Code deploy sonrası `sentrixBootstrap` işini çalıştır ve raporda tüm kayıtlı şemaların başarıyla kontrol edildiğini doğrula.
- [ ] Cloud Code'u Back4App'e ayrıca deploy et.
- [ ] SxDomain.host unique index'i kur.
- [ ] GitHub OAuth App oluştur, Device Flow'u etkinleştir ve iki gerekli değeri Back4App Parse Config'e ekle.
- [ ] Güncel Cloud Code'u deploy et; GitHub hesabını bağla, kişisel depo sahibi ve kuruluş admin doğrulamasını dene; yalnızca push yetkisi olan bir hesapla doğrulamanın reddedildiğini kontrol et.
- [ ] Yeni kullanıcıyla kayıt ve giriş dene.
- [ ] Her test mülkü için indirilen benzersiz doğrulama dosyasını `.well-known/` içine koy, yayımla ve doğrula.
- [ ] Mülklerim listesinden mülk detay ekranını aç; gerçek tracker ve olay verilerini kontrol et.
- [ ] Test hesabında hesap silme işlemini doğrula (üretim hesabında deneme yapma).
- [ ] Tracker snippet'ini ekle ve gerçek sayfa görüntülemesini doğrula.
- [ ] Search Console OAuth ve WAF webhook bağlantılarını ayrı ayrı kurup test et.
- [ ] KVKK aydınlatma ve izin mekanizmasını değerlendir.

**Durum:** Frontend ve temel tracker kaynak kodu repodadır; bunların canlı ortamda çalıştığı, Cloud Code deploy edildiği, MongoDB unique index kurulduğu veya Google/WAF entegrasyonlarının etkin olduğu anlamına gelmez. Canlı uçtan uca test ve dış servis yapılandırması tamamlanmadan sistem üretim için hazır kabul edilmemelidir.

## 11. `Invalid function` hatası: Cloud Code dağıtımı

`Mülk ekle` sırasında `Invalid function: "sentrixCreateDomain"` görülüyorsa alan adı biçimi hatası değildir. `cloud/main.js` içinde `Parse.Cloud.define('sentrixCreateDomain', ...)` tanımı bulunmalıdır ve aynı dosyanın Back4App uygulamasının **Cloud Code / main.js** alanına yüklenip **Deploy** edilmesi gerekir. Yalnızca GitHub'a commit atmak Back4App Cloud Code'u dağıtmaz. Deploy tamamlandıktan sonra `sentrixHealth` fonksiyonunu çağırarak Cloud Code'un yanıt verdiğini, ardından oturumu açık kullanıcıyla `sentrixCreateDomain` çağrısını test edin. `sentrixHealth` çalışıp `sentrixCreateDomain` hâlâ `Invalid function` veriyorsa Back4App'te dağıtılan dosya güncel değildir veya farklı uygulama/ortam hedeflenmiştir. Master Key'i istemciye eklemeyin.



## 12. Advanced analytics and interaction map
Add `data-sentrix-track="header_cta"` to count clicks on a selected element. Add `data-sentrix-conversion="signup_complete"` to count a conversion. Only explicitly marked elements are counted. Form values, typed text, passwords, keystrokes, DOM snapshots and session replay are not collected. This is an aggregate interaction map, not a coordinate-based visual heatmap.

After deploying updated `cloud/main.js`, run `sentrixBootstrap` once. The property panel reads advanced analytics and offers CSV export.

## 13. Uptime monitoring
The `sentrixUptimeSweep` Cloud Job checks verified domains and records HTTP status and response latency. Configure a recurring schedule for this job in Back4App (for example every 5 minutes). A GitHub commit does not create the Back4App schedule. Uptime percentages are calculated only from real stored checks.

## 14. External integrations and limits
Email alerts require a verified mail provider and server-side credentials; they are not reported as active without configuration. AI summaries require an AI provider/key and data-processing configuration. Geographic reporting requires a privacy-reviewed IP geolocation provider. PDF output can be generated through the browser print dialog; CSV export is implemented. Visual session replay is excluded to avoid collecting sensitive page or form contents.
