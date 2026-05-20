
-- Wipe Ladi's phantom deposit records completely
DELETE FROM public.notifications WHERE id IN ('d8426f60-34a3-45de-aaa3-673ea8291768','b10b76b0-56b5-4124-848e-633027c51e13','7e3622af-addd-4c87-902b-8bf0b34741fc','a7ca4a8d-8136-4e81-bf0c-634f89bc5082');

DELETE FROM public.transactions WHERE id IN ('5597f3a5-31b9-422d-9b57-d0f7a6b4708f','23d21033-68bd-48f7-9ae7-c6bb4018fabd','fd4ee73f-b5a8-4689-a4d3-e76a856db74b','4a803558-f810-47e9-8d27-0ea20691fd64');

DELETE FROM public.bsc_sweep_jobs WHERE user_id='7c440382-bf0a-4339-b83e-aa471d8a8653' AND address='0x5042ba6326e12ba075458076cf2d9d248abc2e2d';

DELETE FROM public.bsc_deposit_events WHERE id IN ('ea8e126b-77d7-4994-9295-8bc05777353c','14349490-0904-48af-bfbf-fa0516220472','76013751-8978-407e-8783-83b61fd097dc','cbace4a4-3cfa-4345-a8a0-cc5b24ad0f6e');
