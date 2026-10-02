import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'ar' | 'fr';

interface Translations {
  [key: string]: {
    ar: string;
    fr: string;
  };
}

export const translations: Translations = {
  // Common
  'app.title': { ar: 'نظام إدارة استعمال الزمن', fr: 'Système de Gestion des Emplois du Temps' },
  'app.subtitle': { ar: 'OFPPT - ISTA', fr: 'OFPPT - ISTA' },
  'common.save': { ar: 'حفظ البيانات', fr: 'Enregistrer' },
  'common.cancel': { ar: 'إلغاء', fr: 'Annuler' },
  'common.edit': { ar: 'تعديل', fr: 'Modifier' },
  'common.delete': { ar: 'حذف', fr: 'Supprimer' },
  'common.actions': { ar: 'الإجراءات', fr: 'Actions' },
  'common.confirm': { ar: 'تأكيد وحفظ', fr: 'Confirmer' },
  'common.search': { ar: 'ابحث الآن', fr: 'Rechercher' },
  'common.export': { ar: 'تصدير', fr: 'Exporter' },
  'common.loading': { ar: 'جاري التحميل...', fr: 'Chargement...' },
  'common.success.add': { ar: 'تمت الإضافة بنجاح', fr: 'Ajouté avec succès' },
  'common.success.update': { ar: 'تم التحديث بنجاح', fr: 'Mis à jour avec succès' },
  'common.success.delete': { ar: 'تم الحذف بنجاح', fr: 'Supprimé avec succès' },
  'common.error.load': { ar: 'حدث خطأ أثناء تحميل البيانات', fr: 'Erreur lors du chargement des données' },
  'common.error.save': { ar: 'حدث خطأ أثناء الحفظ', fr: "Erreur lors de l'enregistrement" },
  'common.error.delete': { ar: 'حدث خطأ أثناء الحذف', fr: 'Erreur lors de la suppression' },
  'common.fillAll': { ar: 'الرجاء ملء جميع الحقول', fr: 'Veuillez remplir tous les champs' },
  'common.confirmDelete': { ar: 'هل أنت متأكد من الحذف؟', fr: 'Êtes-vous sûr de vouloir supprimer ?' },

  // Sidebar
  'nav.dashboard': { ar: 'لوحة القيادة', fr: 'Tableau de bord' },
  'nav.formateurs': { ar: 'المكونون', fr: 'Formateurs' },
  'nav.stage': { ar: 'التدريب (Stage)', fr: 'Stages en entreprise' },
  'nav.salles': { ar: 'القاعات والورشات', fr: 'Salles et Ateliers' },
  'nav.filieres': { ar: 'الشعب', fr: 'Filières' },
  'nav.groupes': { ar: 'الأفواج', fr: 'Groupes' },
  'nav.timetable': { ar: 'جدول الحصص', fr: 'Emploi du temps' },
  'nav.vacances': { ar: 'الشواغر', fr: 'Vacances' },
  'nav.export': { ar: 'التصدير PDF', fr: 'Export PDF' },
  'nav.section.main': { ar: 'رئيسي', fr: 'Principal' },
  'nav.section.data': { ar: 'البيانات الأساسية', fr: 'Données de base' },
  'nav.section.plan': { ar: 'التخطيط', fr: 'Planification' },
  'nav.section.reports': { ar: 'التقارير', fr: 'Rapports' },
  'sidebar.connected': { ar: 'Firebase متصل', fr: 'Firebase connecté' },

  // Dashboard
  'dash.title': { ar: 'لوحة القيادة', fr: 'Tableau de bord' },
  'dash.subtitle': { ar: 'نظرة عامة على نظام إدارة استعمال الزمن', fr: 'Aperçu du système de gestion des emplois du temps' },
  'dash.status': { ar: 'النظام يعمل بشكل طبيعي', fr: 'Système opérationnel' },
  'dash.seances': { ar: 'الحصص المبرمجة', fr: 'Séances programmées' },
  'dash.enStage': { ar: 'أفواج في التدريب', fr: 'Groupes en stage' },
  'dash.quickStart': { ar: '🚀 بدء سريع', fr: '🚀 Démarrage rapide' },
  'dash.addFormateur': { ar: 'إضافة مكون جديد', fr: 'Ajouter un formateur' },
  'dash.addSalle': { ar: 'إضافة قاعة جديدة', fr: 'Ajouter une salle' },
  'dash.addSeance': { ar: 'برمجة حصة في الجدول', fr: 'Programmer une séance' },
  'dash.findSalle': { ar: 'البحث عن قاعة شاغرة', fr: 'Trouver une salle vide' },
  'dash.exportPdf': { ar: 'تصدير الجداول PDF', fr: 'Exporter les plannings PDF' },
  'dash.summary': { ar: '📊 ملخص النظام', fr: '📊 Résumé du système' },
  'dash.stat.formateurs': { ar: 'المكونون المسجلون', fr: 'Formateurs enregistrés' },
  'dash.stat.seances': { ar: 'الحصص المبرمجة', fr: 'Séances programmées' },
  'dash.stat.stage': { ar: 'أفواج في التدريب الميداني', fr: 'Groupes en stage pratique' },
  'dash.stat.salles': { ar: 'القاعات والورشات', fr: 'Salles et Ateliers' },

  // Formateurs
  'formateur.title': { ar: 'إدارة المكونين', fr: 'Gestion des Formateurs' },
  'formateur.subtitle': { ar: 'إضافة، تعديل، أو حذف بيانات المكونين (الأساتذة)', fr: 'Ajouter, modifier ou supprimer les formateurs' },
  'formateur.add': { ar: 'إضافة مكون جديد', fr: 'Nouveau formateur' },
  'formateur.edit': { ar: 'تعديل مكون', fr: 'Modifier le formateur' },
  'formateur.empty': { ar: 'لا يوجد مكونون', fr: 'Aucun formateur' },
  'formateur.emptySub': { ar: 'قم بإضافة المكونين للبدء في استخدام النظام', fr: 'Ajoutez des formateurs pour commencer' },
  'formateur.mat': { ar: 'رقم التسجيل (Matricule)', fr: 'Matricule' },
  'formateur.name': { ar: 'الاسم الكامل (Nom & Prénom)', fr: 'Nom & Prénom' },

  // Salles
  'salle.title': { ar: 'إدارة القاعات والورشات', fr: 'Gestion des Salles et Ateliers' },
  'salle.subtitle': { ar: 'إدارة وتصنيف الأماكن المخصصة للتدريس والتدريب', fr: "Gérer et classifier les lieux d'enseignement" },
  'salle.add': { ar: 'إضافة قاعة جديدة', fr: 'Nouvelle salle' },
  'salle.edit': { ar: 'تعديل قاعة', fr: 'Modifier la salle' },
  'salle.empty': { ar: 'لا توجد قاعات', fr: 'Aucune salle' },
  'salle.emptySub': { ar: 'قم بإضافة القاعات والورشات للبدء', fr: 'Ajoutez des salles pour commencer' },
  'salle.name': { ar: 'اسم القاعة / الورشة', fr: 'Nom de la salle / atelier' },
  'salle.type': { ar: 'النوع', fr: 'Type' },
  'salle.salle': { ar: 'قاعة عادية (Salle)', fr: 'Salle normale' },
  'salle.atelier': { ar: 'ورشة عمل (Atelier)', fr: 'Atelier' },

  // Filieres
  'filiere.title': { ar: 'إدارة الشعب والتخصصات', fr: 'Gestion des Filières' },
  'filiere.subtitle': { ar: 'إدارة الشعب التدريبية بالمؤسسة', fr: 'Gérer les filières de formation' },
  'filiere.add': { ar: 'إضافة شعبة جديدة', fr: 'Nouvelle filière' },
  'filiere.edit': { ar: 'تعديل شعبة', fr: 'Modifier la filière' },
  'filiere.empty': { ar: 'لا توجد شعب مسجلة', fr: 'Aucune filière' },
  'filiere.emptySub': { ar: 'قم بإضافة الشعب والتخصصات المتاحة', fr: 'Ajoutez des filières pour commencer' },
  'filiere.code': { ar: 'رمز الشعبة (Code)', fr: 'Code Filière' },
  'filiere.name': { ar: 'الاسم الكامل للشعبة', fr: 'Nom de la filière' },

  // Groupes
  'groupe.title': { ar: 'إدارة الأفواج', fr: 'Gestion des Groupes' },
  'groupe.subtitle': { ar: 'إدارة المجموعات وحالتهم', fr: 'Gérer les groupes et leur statut' },
  'groupe.add': { ar: 'إضافة فوج جديد', fr: 'Nouveau groupe' },
  'groupe.edit': { ar: 'تعديل فوج', fr: 'Modifier le groupe' },
  'groupe.empty': { ar: 'لا توجد أفواج', fr: 'Aucun groupe' },
  'groupe.emptySub': { ar: 'قم بإضافة الأفواج للبدء في جدولة الحصص', fr: 'Ajoutez des groupes pour commencer' },
  'groupe.code': { ar: 'رمز الفوج', fr: 'Code Groupe' },
  'groupe.filiere': { ar: 'الشعبة التابع لها', fr: 'Filière' },
  'groupe.status': { ar: 'حالة الفوج', fr: 'Statut' },
  'groupe.inStage': { ar: 'في تدريب (Stage)', fr: 'En Stage' },
  'groupe.inClass': { ar: 'في المعهد', fr: 'À l\'institut' },
  'groupe.stageToggle': { ar: 'هذا الفوج حالياً في فترة تدريب ميداني (Stage) ولا يمكن جدولة حصص له', fr: 'Ce groupe est actuellement en stage (aucune séance ne peut être programmée)' },

  // Timetable
  'time.title': { ar: 'الجدول الزمني للحصص', fr: 'Emploi du temps' },
  'time.subtitle': { ar: 'تخطيط وبرمجة الحصص الأسبوعية', fr: 'Planification et programmation des séances' },
  'time.viewGlobal': { ar: 'عرض شامل', fr: 'Vue globale' },
  'time.viewFormateur': { ar: 'حسب المكون', fr: 'Par formateur' },
  'time.viewGroupe': { ar: 'حسب الفوج', fr: 'Par groupe' },
  'time.selectFormateur': { ar: '-- اختر المكون --', fr: '-- Sélectionner formateur --' },
  'time.selectGroupe': { ar: '-- اختر الفوج --', fr: '-- Sélectionner groupe --' },
  'time.selectFirst': { ar: 'الرجاء تحديد عنصر', fr: 'Veuillez sélectionner un élément' },
  'time.selectFirstSub': { ar: 'اختر من القائمة أعلاه لعرض الجدول الخاص به', fr: 'Choisissez dans la liste pour voir le planning' },
  'time.daysHours': { ar: 'الأيام / الأوقات', fr: 'Jours / Heures' },
  'time.new': { ar: 'برمجة حصة جديدة', fr: 'Nouvelle séance' },
  'time.module': { ar: 'المادة / الوحدة (Module)', fr: 'Module' },
  'time.formateur': { ar: 'المكون (Formateur)', fr: 'Formateur' },
  'time.groupe': { ar: 'الفوج (Groupe)', fr: 'Groupe' },
  'time.salle': { ar: 'القاعة / الورشة', fr: 'Salle / Atelier' },

  // Vacances
  'vac.title': { ar: 'البحث عن الشواغر', fr: 'Recherche de Vacances' },
  'vac.subtitle': { ar: 'البحث عن القاعات الشاغرة أو الأفواج المتاحة في وقت محدد', fr: 'Trouver des salles vides ou des groupes libres' },
  'vac.searchType': { ar: 'نوع البحث', fr: 'Type de recherche' },
  'vac.sallesVides': { ar: 'القاعات الشاغرة', fr: 'Salles vides' },
  'vac.groupesVides': { ar: 'الأفواج المتاحة', fr: 'Groupes libres' },
  'vac.jour': { ar: 'اليوم', fr: 'Jour' },
  'vac.heure': { ar: 'الحصة الزمنية', fr: 'Créneau horaire' },
  'vac.results': { ar: 'النتائج', fr: 'Résultats' },
  'vac.noSalles': { ar: 'لا توجد قاعات شاغرة في هذا الوقت.', fr: 'Aucune salle vide pour ce créneau.' },
  'vac.noGroupes': { ar: 'لا توجد أفواج متاحة في هذا الوقت.', fr: 'Aucun groupe libre pour ce créneau.' },

  // Export
  'exp.title': { ar: 'تصدير التقارير (PDF)', fr: 'Exportation des Rapports (PDF)' },
  'exp.subtitle': { ar: 'استخراج وطباعة جداول الحصص بصيغة PDF', fr: 'Extraire et imprimer les emplois du temps' },
  'exp.formateurs': { ar: 'جداول المكونين', fr: 'Plannings des Formateurs' },
  'exp.allFormateurs': { ar: 'تصدير جدول جميع المكونين (مجمع)', fr: 'Exporter tous les formateurs (Global)' },
  'exp.single': { ar: 'تصدير فردي:', fr: 'Export individuel :' },
  'exp.groupes': { ar: 'جداول الأفواج', fr: 'Plannings des Groupes' },
  'exp.allGroupes': { ar: 'تصدير جدول جميع الأفواج (مجمع)', fr: 'Exporter tous les groupes (Global)' },
};

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('fr'); // Default to french

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][lang];
    }
    return key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
