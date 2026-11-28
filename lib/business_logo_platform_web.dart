import 'business_logo_pending_store.dart';
import 'indexed_business_logo_store.dart';

BusinessLogoPendingStore createBusinessLogoPendingStore(String project) =>
    IndexedBusinessLogoStore(project);
