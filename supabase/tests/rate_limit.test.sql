-- =============================================================================
-- BeanTrust · Pruebas de rate limit compartido (pgTAP)
--
-- `public.bean_consume_rate_limit(...)` es `security definer` y solo la puede
-- ejecutar `service_role` (FastAPI). Debe permitir exactamente `p_limit`
-- llamadas por ventana y bloquear la siguiente, con ventanas independientes por
-- clave.
-- =============================================================================

begin;

select plan(11);

-- ------------------------------------------------------------ privilegios
select ok(
  not has_function_privilege(
    'authenticated', 'public.bean_consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'authenticated: no puede ejecutar el rate limit');
select ok(
  not has_function_privilege(
    'anon', 'public.bean_consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'anon: no puede ejecutar el rate limit');
select ok(
  has_function_privilege(
    'service_role', 'public.bean_consume_rate_limit(text,integer,integer)', 'EXECUTE'),
  'service_role: sí puede ejecutar el rate limit');

-- ------------------------------------------------------------ comportamiento
set local role service_role;

select ok(
  public.bean_consume_rate_limit('k1', 2, 60),
  'k1: primera llamada permitida');
select ok(
  public.bean_consume_rate_limit('k1', 2, 60),
  'k1: segunda llamada permitida');
select ok(
  not public.bean_consume_rate_limit('k1', 2, 60),
  'k1: tercera llamada bloqueada');

select ok(
  public.bean_consume_rate_limit('k2', 1, 60),
  'k2: primera llamada permitida');
select ok(
  not public.bean_consume_rate_limit('k2', 1, 60),
  'k2: segunda llamada bloqueada');

select ok(
  public.bean_consume_rate_limit('k3', 1, 0),
  'k3: ventana de 0s permite siempre (1)');
select ok(
  public.bean_consume_rate_limit('k3', 1, 0),
  'k3: ventana de 0s reinicia (2)');

reset role;

-- ------------------------------------------------------------ authenticated bloqueado
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  'select public.bean_consume_rate_limit(''k4'', 1, 60)',
  '42501', null::text,
  'authenticated: llamada directa denegada');
reset role;

select * from finish();

rollback;
