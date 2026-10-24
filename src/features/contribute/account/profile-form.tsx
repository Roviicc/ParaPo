import { useState } from 'react';

import { Button } from '@/design-system/primitives/button';
import { TextField } from '@/design-system/primitives/text-field';

import { checkProfile, type ProfileFields } from './account-fields';
import { normalisePhoneNumber } from './phone-number';

interface ProfileFormProps {
  /** The stored name and number the fields start from. */
  profile: ProfileFields;
  isBusy: boolean;
  /** One line about the last try, or null. */
  error: string | null;
  onSubmit: (fields: ProfileFields) => void;
}

/** Name and number to change; Save is there only while they differ from what is stored. */
export function ProfileForm({ profile, isBusy, error, onSubmit }: ProfileFormProps) {
  const [fields, setFields] = useState<ProfileFields>(profile);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({});

  const typedPhone = fields.phone.trim();
  const isChanged =
    fields.name.trim() !== profile.name ||
    (normalisePhoneNumber(typedPhone) ?? typedPhone) !== profile.phone;

  const handleSubmit = () => {
    const checked = checkProfile(fields);
    setFieldErrors(checked.isValid ? {} : checked.errors);
    if (checked.isValid) onSubmit(checked.value);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <TextField
        label="Name"
        autoComplete="name"
        value={fields.name}
        error={fieldErrors.name}
        onChange={(event) => setFields({ ...fields, name: event.target.value })}
      />
      <TextField
        label="Number"
        type="tel"
        autoComplete="tel"
        value={fields.phone}
        error={fieldErrors.phone}
        onChange={(event) => setFields({ ...fields, phone: event.target.value })}
      />
      {error && (
        <p role="alert" className="text-sm/5">
          {error}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          label={isBusy ? 'Saving…' : 'Save'}
          disabled={isBusy || !isChanged}
        />
      </div>
    </form>
  );
}
