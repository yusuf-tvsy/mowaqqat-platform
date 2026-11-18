# نشر واجهة تقارير كادر دون جهاز محلي

هذا المسار مخصص لاستكمال تحديث التقارير من GitHub Codespaces مع Railway SSH، دون استخدام Desktop Commander. **هذه الملفات لا تنشر تلقائيًا على الإنتاج.**

## التهيئة (تتم مرة واحدة من المتصفح)
1. افتح GitHub Codespaces لهذا المستودع، على الفرع `ops/kader-reports-codespaces-20261119`.
2. من Terminal، تحقق من تثبيت Railway CLI، ثم شغّل `railway login --browserless`. أكمل المصادقة من الصفحة الرسمية. لا تشارك كلمة مرور أو رمزًا داخل محادثة.
3. أنشئ مفتاحًا خاصًا بتلك الجلسة (اترك ملف المفتاح خاصًا داخل Codespace):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -q -t ed25519 -f ~/.ssh/kader_codespaces_ed25519 -N ''
railway ssh keys add --key ~/.ssh/kader_codespaces_ed25519.pub --name kader-codespaces-20261119
```

4. حدّد المشروع والخدمة من لوحة Railway الصحيحة ثم نفّذ:

```bash
export KADER_PROJECT_ID="REPLACE_WITH_VERIFIED_ID"
export KADER_SERVICE_ID="REPLACE_WITH_VERIFIED_ID"
bash scripts/kader_cloud_preflight.sh
```

## شروط ما قبل الكتابة
- افحص المسار الحقيقي لملفات الإصدار داخل `/data`. **لا تفترض** وجود `index.html`؛ قد يولّد التطبيق HTML ديناميكيًا.
- احفظ خارج Railway نسخة SQLite متسقة من `sqlite3.Connection.backup()`، ونسخة من أصول الواجهة؛ انقلها عبر SCP/SFTP.
- تحقق من سلامة SQLite (`PRAGMA integrity_check = ok`)، وأرشيف الاستعادة، وبصمة SHA256. احتفظ بالنسخ في مجلد خاص خارج المستودع ولا ترفعها إلى GitHub.
- حمّل حزمة `kader_reports_release_20261119.zip` من المحادثة إلى Codespace. يعمل `install_static_assets.py` بوضع dry-run افتراضيًا ويرفض النشر دون تحقق حديث.
- قبل `--apply` تأكد من أن HTML ومسار CSS/JS المطابقين هما ما يخدم الموقع بالفعل. توقف عند عدم التطابق.
- لا تغيّر صورة التشغيل أو `startCommand`، ولا تنقل قاعدة البيانات، ولا تحذف المتغيرات أو الحسابات.

## الاختبار والرجوع
بعد الدمج، تحقق من `https://kader.media/#reports` بحساب مصادق، على عرض 1440/1024/390 بكسل. افحص التقويم والدوريات والشركات والفلاتر وبدء إنشاء التقارير والمراجعة والاعتماد وسلامة باقي الأقسام. عند فشل أي شرط، استعد الأصول الأصلية فورًا.

**ملاحظة:** هذه عملية إعداد مسار وصول بديل، لا إثبات بنشر أو نسخ احتياطي جديد. خدمة كادر الحالية تعتمد على الملفات المثبتة في وحدة التخزين وليس على الفرع العام في GitHub.
