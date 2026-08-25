import { nextTick, ref } from 'vue';
import { object, string } from 'yup';
import { useValidator } from '../src/Composables/validator.js';

describe('useValidator', () => {
    const schema = object({
        email: string().email().required(),
        nickname: string().nullable(),
    });

    it('detects required fields from the schema', () => {
        const data = ref({ email: '', nickname: '' });
        const vali = useValidator(data, schema);

        expect(vali.for('email').required.value).toBe(true);
        expect(vali.for('nickname').required.value).toBe(false);
    });

    it('hides errors until the field is touched, then shows/clears them as the value changes', async () => {
        const data = ref({ email: '', nickname: '' });
        const vali = useValidator(data, schema);
        const emailField = vali.for('email');

        // invalid from the start, but untouched — must stay hidden
        expect(emailField.hasError.value).toBe(false);

        data.value.email = 'not-an-email';
        await nextTick();
        expect(emailField.hasError.value).toBe(true);
        expect(emailField.errorMessage.value).not.toBeNull();

        data.value.email = 'user@example.com';
        await nextTick();
        expect(emailField.hasError.value).toBe(false);
        expect(emailField.errorMessage.value).toBeNull();
        expect(vali.allIsValid.value).toBe(true);
    });

    it('markSubmitted() shows existing errors without requiring the field to be touched', async () => {
        const data = ref({ email: '', nickname: '' });
        const vali = useValidator(data, schema);
        const emailField = vali.for('email');
        await nextTick();

        expect(emailField.hasError.value).toBe(false);

        vali.markSubmitted();
        await nextTick();

        expect(emailField.hasError.value).toBe(true);
        expect(vali.allIsValid.value).toBe(false);
    });

    it('markSubmitted() re-checks a field whose when() condition depends on a sibling field that changed', async () => {
        const conditionalSchema = object({
            hasCompany: string(),
            companyName: string().when('hasCompany', {
                is: 'true',
                then: (s) => s.required(),
                otherwise: (s) => s,
            }),
        });
        const data = ref({ hasCompany: '', companyName: '' });
        const vali = useValidator(data, conditionalSchema);
        const companyNameField = vali.for('companyName');
        await nextTick();

        // Not required yet — hasCompany is still falsy, companyName was never touched directly.
        vali.markSubmitted();
        await nextTick();
        expect(companyNameField.hasError.value).toBe(false);

        // Only the SIBLING field changes — companyName's own watch never fires on its own.
        data.value.hasCompany = 'true';
        await nextTick();

        vali.markSubmitted();
        await nextTick();
        expect(companyNameField.hasError.value).toBe(true);
        expect(vali.allIsValid.value).toBe(false);
    });

    it('supports extra (non-yup) errors via extraErrors', async () => {
        const data = ref({ email: 'user@example.com', nickname: '' });
        const vali = useValidator<{ email: string; nickname: string }, 'serverError'>(data, schema);

        vali.extraErrors.serverError = 'Email already exists';
        await nextTick();

        expect(vali.allErrors.value.serverError).toBe('Email already exists');
        expect(vali.allIsValid.value).toBe(false);

        delete vali.extraErrors.serverError;
        await nextTick();

        expect(vali.allIsValid.value).toBe(true);
    });
});
