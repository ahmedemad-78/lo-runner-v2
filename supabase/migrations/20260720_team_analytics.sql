-- Team Leader-only analytics: LOS counts per tester with status breakdown
-- Applied remotely via Supabase MCP (team_analytics_rpc)

CREATE OR REPLACE FUNCTION public.team_analytics(
  p_access_code text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  u public.users;
  v_from timestamptz;
  v_to timestamptz;
  v_subject text;
  ranking jsonb;
  subjects jsonb;
  total_los bigint;
  active_testers bigint;
  top_tester text;
  top_los bigint;
  avg_los numeric;
BEGIN
  u := private.require_user(p_access_code);
  IF u.role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'forbidden: team_leader role required'
      USING ERRCODE = '42501';
  END IF;

  v_from := coalesce(p_from, '-infinity'::timestamptz);
  v_to := coalesce(p_to, 'infinity'::timestamptz);
  v_subject := nullif(trim(coalesce(p_subject, '')), '');

  WITH filtered AS (
    SELECT
      tk.id,
      tk.result,
      tk.subject,
      coalesce(nullif(tk.source_username, ''), us.username) AS tester_name
    FROM public.tasks tk
    JOIN public.users us ON us.id = tk.user_id
    WHERE tk.created_at >= v_from
      AND tk.created_at <= v_to
      AND (v_subject IS NULL OR tk.subject = v_subject)
  ),
  by_tester AS (
    SELECT
      tester_name,
      count(*)::bigint AS los_count,
      count(*) FILTER (WHERE result = 'Approve')::bigint AS approved,
      count(*) FILTER (WHERE result = 'Hold')::bigint AS pending,
      count(*) FILTER (WHERE result = 'Rollback')::bigint AS rollbacks
    FROM filtered
    GROUP BY tester_name
  ),
  ranked AS (
    SELECT
      tester_name,
      los_count,
      approved,
      pending,
      rollbacks,
      dense_rank() OVER (ORDER BY los_count DESC, tester_name ASC)::int AS rank
    FROM by_tester
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'rank', r.rank,
        'tester', r.tester_name,
        'los_count', r.los_count,
        'approved', r.approved,
        'pending', r.pending,
        'rollbacks', r.rollbacks
      )
      ORDER BY r.rank ASC, r.tester_name ASC
    ), '[]'::jsonb),
    coalesce(sum(r.los_count), 0),
    count(*)::bigint,
    (array_agg(r.tester_name ORDER BY r.rank ASC, r.tester_name ASC))[1],
    coalesce((array_agg(r.los_count ORDER BY r.rank ASC, r.tester_name ASC))[1], 0),
    CASE WHEN count(*) > 0 THEN round(sum(r.los_count)::numeric / count(*), 1) ELSE 0 END
  INTO ranking, total_los, active_testers, top_tester, top_los, avg_los
  FROM ranked r;

  SELECT coalesce(jsonb_agg(DISTINCT sub ORDER BY sub), '[]'::jsonb)
  INTO subjects
  FROM (
    SELECT tk.subject AS sub
    FROM public.tasks tk
    WHERE tk.subject IS NOT NULL AND tk.subject <> ''
    ORDER BY 1
  ) s;

  RETURN jsonb_build_object(
    'range', jsonb_build_object(
      'from', CASE WHEN p_from IS NULL THEN NULL ELSE p_from END,
      'to', CASE WHEN p_to IS NULL THEN NULL ELSE p_to END
    ),
    'subject', v_subject,
    'summary', jsonb_build_object(
      'total_los', total_los,
      'active_testers', active_testers,
      'top_tester', top_tester,
      'top_los', top_los,
      'avg_los', avg_los
    ),
    'ranking', ranking,
    'subjects', subjects
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.team_analytics(text, timestamptz, timestamptz, text) TO anon, authenticated, service_role;
