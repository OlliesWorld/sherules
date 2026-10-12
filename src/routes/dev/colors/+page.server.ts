import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { PageServerLoad } from './$types';

// Color comparison page for development only. In production it's a 404.
// (A static route like /dev/colors wins over the dynamic /[sport]/[league] route.)
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return { sports: ['volleyball', 'basketball'] };
};
