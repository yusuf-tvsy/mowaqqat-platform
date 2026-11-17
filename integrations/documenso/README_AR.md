# تكامل Documenso مع كادر — مسودة تقنية منفصلة

**الحالة:** أنشئ للتهيئة والمراجعة والاختبار الاصطناعي فقط. **ليس مرتبطًا بحساب Documenso مصادق عليه، ولم ينشر على إنتاج كادر.**

## الاختيار
Documenso هو المزود المقترح بعد مراجعة الوثائق الرسمية في 2026-11-17:
- Cloud Free يسمح 5 مستندات شهريًا، ووثائق API تشير إلى إتاحة API في الخطة المجانية. يخضع الاستخدام لسياسة Fair Use.
- API v2: https://app.documenso.com/api/v2؛ تستخدم الموارد الجديدة envelope بدلاً من document القديمة.
- **Webhooks تتطلب Team** ولا تكون متاحة للحسابات الشخصية. تأكد من نوع الحساب قبل محاولة تفعيل أحداث التوقيع.
- الاستضافة الذاتية تتطلب PostgreSQL وSMTP وشهادة توقيع وReverse Proxy؛ ليست تركيبًا بسيطًا على خادم كادر الحالي.
- ينبغي اعتماد حساب مؤسسي، لا استعمال حساب فردي للعقود الحساسة دون تفويض.

## وظائف هذا النموذج
1. عميل قراءة فقط باستخدام GET /envelope وGET /envelope/{envelopeId}. لا يستطيع إرسال العقود أو حذفها أو التوقيع نيابة عن أي شخص.
2. استقبال POST /hooks/documenso، والتحقق من قيمة X-Documenso-Secret بالمقارنة ثابتة الزمن قبل قراءة البيانات.
3. إحضار الحالة الحالية من API بشكل مستقل بعد التحقق من الحدث لمنع اعتماد حالة اكتمال مزورة.
4. تحويل الحدث إلى أقل بيانات ضرورية: envelopeId، externalId (معرّف عقد مسجل سابقًا في كادر)، النوع، الحالة، الزمن، idempotencyKey.
5. إرسال الحدث إلى Kader sync endpoint المحمي، ورفض تأكيد الاستلام عند تعذر الوصول.
6. لا نقل لمحتوى الملفات أو بيانات الموقعين أو روابط التوقيع.
7. المسار /healthz يفحص توافر إعدادات الربط.

## القيود الأمنية المهمة
- بحسب وثائق Documenso الحالية، X-Documenso-Secret **قيمة سرية خام** وليست توقيع HMAC على جسم الحدث. لذلك يلزم HTTPS ومفتاح طويل خاص بالويب هوك، والتحقق من حالة المستند مباشرة عبر API.
- الاستناد إلى externalId لا يمنح حق إنشاء عقد جديد: يجب على كادر مطابقة external_contract_id مسبقًا مع سجل عقد معروف ومع صلاحيات الشركة.
- endpoint كادر المستهدف **غير مثبت وجوده**: KADER_DOCUMENSO_SYNC_URL مسار مقترح، ويجب على فريق backend تنفيذه مع مصادقة وتفويض وقفل للتكرار (idempotency).
- خدمة الاستقبال تعمل بأسلوب fail-closed: إذا لم تتوفر مفاتيح أو نقطة حفظ متحققة ترجع 502/503، ولا تعلن نجاح تحديث أي عقد.
- لا تنشر API token في GitHub أو صفحات الويب أو البريد. خزنه في secrets manager الخاص ببيئة الاختبار/الإنتاج.
- راجع الصلاحية القانونية للتوقيعات في كل دولة والاحتفاظ بالأدلة وسجل التدقيق.

## تشغيل وفحص بدون أي وثائق حقيقية
Node.js 22 أو أحدث:
  node --test integrations/documenso/tests/bridge.test.mjs

بعد إعداد الأسرار في بيئة اختبار:
  node integrations/documenso/server.mjs

## خطوات الوصول إلى التكامل الحقيقي
1. إنشاء أو تسجيل الدخول لحساب Documenso مع اعتماد مالك الحساب المؤسسي، واختيار Team.
2. إنشاء API token خاص بالاختبار من Team Settings > API Tokens. يمكن اختيار مدة انتهاء محددة.
3. إنشاء Webhook ضمن إعدادات الفريق فقط إن توفرت ميزة Webhooks، مع تعيين Secret مستقل.
4. تنفيذ endpoint داخلي في كادر للمزامنة وفق عقد JSON أدناه، مع إرجاع 2xx فقط بعد حفظ آمن.
5. تشغيل الخدمة في staging منفصل، وربط webhook URL بها، وتجربة مستند اختبار غير حساس.
6. تأكيد طلبات التوقيع وحقوق المستخدمين قبل السماح بالإرسال الفعلي.

## عقد مزامنة كادر المقترح — غير منشور
POST /mowaqqat/api/integrations/documenso/events

Example:
  {
    "schema_version":1,
    "provider":"documenso",
    "envelope_id":"envelope_example123",
    "external_contract_id":"KADER-CONTRACT-TEST-1",
    "event_type":"DOCUMENT_COMPLETED",
    "observed_status":"completed",
    "occurred_at":"2026-11-17T00:00:00.000Z",
    "idempotency_key":"<sha256>"
  }

**لا تعتبر هذه المواصفة دليلاً على وجود المسار في إنتاج كادر.**

## مصادر تقنية
https://docs.documenso.com/docs/developers/getting-started/authentication
https://docs.documenso.com/docs/developers/api/documents
https://docs.documenso.com/docs/developers/webhooks/setup
https://docs.documenso.com/docs/developers/webhooks/verification
https://docs.documenso.com/docs/self-hosting/getting-started/requirements
