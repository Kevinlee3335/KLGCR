import {createAdminClient} from './supabase/admin';

// Called only after the caller has checked the signed-in user's billing access.
export async function ensureUtilityMonth(){
 const {error}=await createAdminClient().rpc('ensure_utility_month');
 if(error)throw Error('Unable to prepare the current utility month. No readings were changed.');
}
