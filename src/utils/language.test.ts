import { detectLanguage } from '@/utils/language.ts';
import { assertEquals } from '@std/assert';

Deno.test('Detect English language', () => {
  assertEquals(detectLanguage(``, 0.90), undefined);
  assertEquals(detectLanguage(`Good morning my fellow friends`, 0.90), 'en');
  assertEquals(
    detectLanguage(
      `Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
  assertEquals(
    detectLanguage(
      `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uWould you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
  assertEquals(
    detectLanguage(
      `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u 😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎    https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
});
