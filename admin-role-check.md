فُتح محرر SQL في مشروع AB Secure Messenger. استعلام القراءة الجاري للتحقق من الحساب هو: SELECT id, username, display_name FROM public.profiles WHERE lower(username) = lower('ret@'); تم إدخاله عبر محرر CodeMirror وتشغيل زر Run من واجهة الصفحة، ولم تُنفذ أي كتابة أو تغيير صلاحية حتى تظهر نتيجة الحساب.
نتيجة الاستعلام في Lovable: Query succeeded, No rows returned. لا يوجد حساب باسم ret@ في public.profiles، لذلك لم تُمنح أي صلاحية ولم يُنفذ أي تعديل.
بعد تصحيح الاسم إلى ret، تم استبدال استعلام CodeMirror وتشغيله من زر Run. لم تُنفذ أي كتابة في قاعدة البيانات حتى قراءة النتيجة.
ظهر الحساب ret بالمعرّف 255056f4-33ec-4dd0-b3cc-a4075de2145b. تم إدخال أمر INSERT محكوم إلى user_roles لمنحه admin مع ON CONFLICT DO NOTHING، ثم تشغيله من محرر Lovable.
التحقق النهائي أعاد صفًا واحدًا: role=admin وuser_id=255056f4-33ec-4dd0-b3cc-a4075de2145b. تمت الترقية بنجاح.
