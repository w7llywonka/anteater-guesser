// Land masks (Natural Earth 1:50m, public domain), run-length encoded:
//  - 1° world grid, rows 75°N → 60°S, so "anywhere on Earth" drops start on land;
//  - 0.02° (~2 km) Southern California grid so local drops never start in the Pacific.

const TOP = 75;
const ROWS = 135;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const RLE =
  '6BHCOBJBfl_MDcYBB_E4JICDECFDCCHVfBD_MDSCEaDDBFEDBBMDl3GBJBDDGBBEEBEDDUeBC_MCOECBBBDwMFiAC2DDCBLFBDCDQBBRBBaBD_NDMEBCCGBtDBCEBLdUICBlJHEDVOCBWBBDBuCBFkGBJB_NURYGBBFBBBCEOFBBBBDGCEBBJOCBbpBBNcEEFB_fDHCACM0BBEEHBCDBCCEIHOZrBBVGCHBBEBIBIB_nAFL3BMBHBGECDIKVxZDBDYC_rAJGBE_KCCJMITwUCGDaC_tABDEE_QBBBBLHCCKNQBBIaKDKF__OGCL_KCEECDIOLSIZKDLC__ODICJ_HFCNCBDOKVCaCBJC__fBP_JJCEBICCBOIwMD__QCMBBBO_JQGXHvMF__JDCCJHPNBDCzRIYCqBGNEEBBB__AHGBCJSIOtRIFB_GFBHHCB_6BBBDFDRXDBBPsPKBE6CJDCGFBB_2SDSXBBDQrQP3FOFBBDBB_1RGRUCYBBsLP5CLDCEE_2SHRuBBuJR3DKEBBH_0UGSPBiwCWyDBDKBDBCDB_2TFTvBCwDXuEDDHBB__GPEUwBDuDXuECGD__KBBNCW0_IBBzFD__LBBNCW0BC_CDBzBG__MCCk1CB5DCECBB0BB__OCCk43BEGFw__TCBl4BB5JBBBz__PDBl47BBCB6hBECLE_WFBk4_A8OBQDCDKF_Vr44CC_ANDOJJD_XGBl42-DDJDEDMLID_VGEj41-MGBBDEKOGF_PLBl41-LLDDJEEFIF_Ny4y_CKHCFDBFFVD_FBHLCm4y_CJCBFCGBDDEWE_DCCCDMCm5wuBTJQBEDCXF_BHDMCm6u_EIOCHBEWF_CBCFCKCn6u_HBGKSCBCC_WGCHFn7t_HBEMZ_VGDFGo7s_HRa_VGBEDBCr-n_ITY_XFBDEu_Ak_JYFDM_XKBw_ACBh_IaEHH_YJBx_BBCg_IdB_m7_CCBREBHC_IqBPD_I6_DBBPOC_H7D_I6_CDBOOD_EvCNE_F7_ECCMPC_DwCOH_A8_FBCMQB_CyCNJHB18_FBDK_UyCOECKzDB6_HBCJ_T0DUJxDB7_LIOBBE-0DVKsGB7_MHJBJC82CULCBOFQCB_G_LJHDKC71DTOOGODB_GYByJFEOD21ERPMJMDC_G_NJCBBDOG02DQQLKMDB_H_QN_J3DNSKMMNC6_SL_J3EKUJMCCKMC6_YJ_E5DJWGSLLB7_ZJ_D6CGZGSLLC6_cF_E7BEcFSCBILBBC4_eD_E8KBVFTBCHPB3_fCLBCB26HBZETBDGNBBC2_fDHEBFCBw7BGZESBFDMB8_hCCBDEBKv_CZDBBRBGBMBGB2_hECSv_AbBCBRCXD2_kBCTv-eCRBYD1_oTvOBtfCSCOCGC2_oYrKFsuBEDME9_oZsBNBCnwCDCLF9_oa9lyCCCKE_A_nb9k0CCCHHKBz_md8i3DBBFJKBz_ld8i4EGJDDEBz_lg5h6DBBEJJBCBBBv_kcBDBD2h7DGHCDFBECu_kfBE3f8GDHCDOFn_kqyd-EJBDBBBEBDBCLk_kryb_BDeJj_kuvb_CCNBOBDICBBCc_ltvb_EDZBEJHBY_ltwa_FGSBGJh_mswa_NGBCCBNDDCg_nqxb_QBEBWCBBd_nqya_vBd_ooza_bBBBJBKBa_onzcIB_SGFBlHB_hl0cHC_RGGCk_plzdHC_NCCGGDj_qkzdFE_LMFEj_sizcEG_KPBBBEWBLBeB_PgzaGF_KSBFi_ve0ZHF_KYi_ve1WJF_Jbg_ve1WJFIB8fPBP_vd3VIF_EiQBO_vc4WHF_Dke_vZ7VJE_Dld_uY-UJD_Dnc_uW_BSMB_Fnb_uW_BS_Rob_uX_AS_Soa_uW_CQ_Una_uV_EO_Vmb_tW_EO_Vmb_tU_HM_Xlb_uT_HL_YKISc_tNBF_IJ_aILCBNd_tOBD_KB_hDQBBOd_sQ___GMXBG_sQ___IKYBF_rR___IKZBE_rQ___MBBCcDC_sL___vDD_rM___wCD_rJ___VDYCBBE_sJ___UDXDG_sI___WBXDH_sI___sDJ_qI___tEJ_qI___uCK_rI___5_pBBH___6_qH__LB_v_qG___8_rFJC___x_rF___8_rBBBCB___7_tBBEdB___b_____t_____t_____t_____t_____t';

const SC = { lat0: 32.4, lat1: 35.0, lng0: -119.6, lng1: -116.0, step: 0.02, rows: 130, cols: 180 };
const SOCAL_RLE =
  'A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2A__2B__1D__zG__wI__uK__sM__qO__oP__nR__lR__lR__lS__kS__kT__jV__hX__fb__be__YBBg__UACjIG__DAC1_-4_94_95_86_77_67_68_58_58_58_58_58_58HF_t-EJ_q_O_o_P_n_Q_m_R_l_T_j_U_i_W_g_Y_e_a_c_c_a_d_Z_f_X0Bq_W0Eo_V1Fo_T3Gm_S4Gm_R4Hn_P5Hn_O5In_N_r_L_s_KBF_n_JCF_m_JDF_m_I_v_H_w_G_w_G_x_F_y_E_z_D_z_D_0_C_0_C_0_CzC_A_BzD-_B0C-_B1C-_A2C9_A2D8_A3E6_A3F5_A4F4_A6E3_A_2_A_2_A_2_A_2_A_2_A_2_A_3-_3BD6_85_85_85_85_85_85_94_94_94_-3_-3_-3__A2';

let grid: Uint8Array | null = null;
let socal: Uint8Array | null = null;

function decode(rle: string, rows: number, cols: number): Uint8Array {
  const g = new Uint8Array(rows * cols);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    let c = 0;
    let v = 0;
    while (c < cols) {
      let n = 0;
      let k: number;
      do {
        k = A.indexOf(rle[i++]);
        n += k;
      } while (k === 63);
      if (v) g.fill(1, r * cols + c, r * cols + c + n);
      c += n;
      v ^= 1;
    }
  }
  return g;
}

export function isLand(lat: number, lng: number): boolean {
  if (lat > SC.lat0 && lat < SC.lat1 && lng > SC.lng0 && lng < SC.lng1) {
    socal ??= decode(SOCAL_RLE, SC.rows, SC.cols);
    const r = Math.floor((SC.lat1 - lat) / SC.step);
    const c = Math.floor((lng - SC.lng0) / SC.step);
    return socal[r * SC.cols + c] === 1;
  }
  grid ??= decode(RLE, ROWS, 360);
  const r = Math.floor(TOP - lat);
  const c = Math.floor(lng + 180);
  if (r < 0 || r >= ROWS || c < 0 || c >= 360) return false;
  return grid[r * 360 + c] === 1;
}
