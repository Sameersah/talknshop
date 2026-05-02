from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from matplotlib.patches import FancyBboxPatch


def load_data(docs_dir: Path):
    metrics = pd.read_csv(docs_dir / "metrics_template.csv")
    result_quality = pd.read_csv(docs_dir / "result_quality.csv")
    latency = pd.read_csv(docs_dir / "latency_breakdown.csv")
    return metrics, result_quality, latency


def add_sus_score(df: pd.DataFrame) -> pd.DataFrame:
    sus_cols = [f"sus_q{i}" for i in range(1, 11)]
    if not set(sus_cols).issubset(df.columns):
        df["sus_score"] = pd.NA
        return df

    odd_cols = [f"sus_q{i}" for i in [1, 3, 5, 7, 9]]
    even_cols = [f"sus_q{i}" for i in [2, 4, 6, 8, 10]]

    adjusted = pd.DataFrame(index=df.index)
    adjusted[odd_cols] = df[odd_cols].apply(pd.to_numeric, errors="coerce") - 1
    adjusted[even_cols] = 5 - df[even_cols].apply(pd.to_numeric, errors="coerce")
    df["sus_score"] = adjusted.sum(axis=1) * 2.5
    return df


def save_fig_task_time(df: pd.DataFrame, out_dir: Path):
    plt.figure(figsize=(10, 5))
    ax = sns.barplot(data=df, x="task_type", y="task_time_sec", hue="group", errorbar="sd")
    ax.set_title("Task Completion Time by Task Type")
    ax.set_xlabel("Task Type")
    ax.set_ylabel("Time (sec)")
    plt.xticks(rotation=25, ha="right")
    plt.tight_layout()
    plt.savefig(out_dir / "fig3_task_completion_time.png", dpi=300)
    plt.close()


def save_fig_sus(df: pd.DataFrame, out_dir: Path):
    sus_df = df[["participant_id", "group", "sus_score"]].dropna().drop_duplicates()
    if sus_df.empty:
        return

    plt.figure(figsize=(7, 4))
    ax = sns.boxplot(data=sus_df, x="group", y="sus_score")
    ax.axhline(68, color="red", linestyle="--", linewidth=1, label="SUS=68 benchmark")
    ax.set_title("SUS Score Distribution by Group")
    ax.set_xlabel("Group")
    ax.set_ylabel("SUS Score (0-100)")
    ax.legend()
    plt.tight_layout()
    plt.savefig(out_dir / "fig5_sus_distribution.png", dpi=300)
    plt.close()


def save_fig_latency(lat: pd.DataFrame, out_dir: Path):
    comp_cols = ["ws_ms", "llm_ms", "api_ms", "ranking_ms"]
    for col in comp_cols:
        lat[col] = pd.to_numeric(lat[col], errors="coerce")

    lat_grouped = lat.groupby("task_type", dropna=False)[comp_cols].mean().reset_index()
    lat_grouped = lat_grouped.set_index("task_type")
    lat_grouped.plot(kind="bar", stacked=True, figsize=(10, 5))
    plt.title("Latency Breakdown by Task Type (Mean ms)")
    plt.xlabel("Task Type")
    plt.ylabel("Latency (ms)")
    plt.xticks(rotation=25, ha="right")
    plt.tight_layout()
    plt.savefig(out_dir / "fig8_latency_breakdown.png", dpi=300)
    plt.close()


def save_fig_precision_recall(result_quality: pd.DataFrame, out_dir: Path):
    rq = result_quality.copy()
    rq["is_relevant"] = pd.to_numeric(rq["is_relevant"], errors="coerce").fillna(0)

    # Precision@5 per task, then averaged by group.
    rows = []
    for task_id, grp in rq.groupby("task_id"):
        topk = grp.nsmallest(5, "returned_rank")
        precision_at_5 = topk["is_relevant"].sum() / 5.0
        recall_at_5 = topk["is_relevant"].sum() / max(grp["is_relevant"].sum(), 1)
        group = grp["group"].iloc[0] if "group" in grp.columns else "unknown"
        rows.append(
            {
                "task_id": task_id,
                "group": group,
                "precision_at_5": precision_at_5,
                "recall_at_5": recall_at_5,
            }
        )

    pr = pd.DataFrame(rows)
    if pr.empty:
        return

    pr_long = pr.melt(id_vars=["task_id", "group"], value_vars=["precision_at_5", "recall_at_5"], var_name="metric", value_name="value")
    plt.figure(figsize=(8, 5))
    ax = sns.barplot(data=pr_long, x="metric", y="value", hue="group", errorbar="sd")
    ax.set_title("Precision@5 and Recall@5 by Group")
    ax.set_xlabel("Metric")
    ax.set_ylabel("Score")
    plt.ylim(0, 1.0)
    plt.tight_layout()
    plt.savefig(out_dir / "fig11_precision_recall.png", dpi=300)
    plt.close()


def save_fig_conversion_funnel(df: pd.DataFrame, out_dir: Path):
    # Synthetic funnel stages derived from available study fields.
    stages = ["Query", "View", "Compare", "Cart", "Purchase"]
    rows = []
    for group, grp in df.groupby("group"):
        total = len(grp)
        compare = int((grp["task_type"] == "cross_marketplace_compare").sum())
        cart = int(pd.to_numeric(grp["completed"], errors="coerce").fillna(0).sum())
        purchase = int(pd.to_numeric(grp["purchase_made"], errors="coerce").fillna(0).sum())
        values = [total, total, compare, cart, purchase]
        for stage, value in zip(stages, values):
            rows.append({"group": group, "stage": stage, "count": value})

    funnel = pd.DataFrame(rows)
    stage_order = pd.CategoricalDtype(categories=stages, ordered=True)
    funnel["stage"] = funnel["stage"].astype(stage_order)
    funnel = funnel.sort_values("stage")

    plt.figure(figsize=(9, 5))
    ax = sns.barplot(data=funnel, x="stage", y="count", hue="group")
    ax.set_title("Conversion Funnel by Group")
    ax.set_xlabel("Stage")
    ax.set_ylabel("Count")
    plt.tight_layout()
    plt.savefig(out_dir / "fig4_conversion_funnel.png", dpi=300)
    plt.close()


def save_fig_turn_distribution(df: pd.DataFrame, out_dir: Path):
    plot_df = df.copy()
    plot_df["conversation_turns"] = pd.to_numeric(plot_df["conversation_turns"], errors="coerce")
    plot_df = plot_df.dropna(subset=["conversation_turns", "task_type"])
    if plot_df.empty:
        return

    plt.figure(figsize=(10, 5))
    ax = sns.violinplot(data=plot_df, x="task_type", y="conversation_turns", hue="group", cut=0)
    ax.set_title("Conversation Turns by Task Type")
    ax.set_xlabel("Task Type")
    ax.set_ylabel("Turns")
    plt.xticks(rotation=25, ha="right")
    plt.tight_layout()
    plt.savefig(out_dir / "fig6_turn_distribution.png", dpi=300)
    plt.close()


def save_fig_price_distribution(result_quality: pd.DataFrame, out_dir: Path):
    rq = result_quality.copy()
    rq["price"] = pd.to_numeric(rq["price"], errors="coerce")
    rq = rq.dropna(subset=["price", "marketplace"])
    if rq.empty:
        return

    plt.figure(figsize=(10, 5))
    ax = sns.boxplot(data=rq, x="marketplace", y="price")
    ax.set_title("Cross-Marketplace Price Distribution")
    ax.set_xlabel("Marketplace")
    ax.set_ylabel("Price (USD)")
    plt.xticks(rotation=25, ha="right")
    plt.tight_layout()
    plt.savefig(out_dir / "fig7_price_distribution.png", dpi=300)
    plt.close()


def save_fig_listing_efficiency(df: pd.DataFrame, out_dir: Path):
    plot_df = df[df["task_type"].isin(["single_listing", "multi_listing"])].copy()
    plot_df["target_marketplaces_count"] = pd.to_numeric(plot_df["target_marketplaces_count"], errors="coerce")
    plot_df["task_time_sec"] = pd.to_numeric(plot_df["task_time_sec"], errors="coerce")
    plot_df = plot_df.dropna(subset=["target_marketplaces_count", "task_time_sec", "group"])
    if plot_df.empty:
        return

    agg = (
        plot_df.groupby(["group", "target_marketplaces_count"], dropna=False)["task_time_sec"]
        .mean()
        .reset_index()
    )

    plt.figure(figsize=(9, 5))
    ax = sns.lineplot(
        data=agg,
        x="target_marketplaces_count",
        y="task_time_sec",
        hue="group",
        marker="o",
    )
    ax.set_title("Listing Efficiency vs Target Marketplaces")
    ax.set_xlabel("Target Marketplaces")
    ax.set_ylabel("Average Listing Time (sec)")
    plt.tight_layout()
    plt.savefig(out_dir / "fig9_listing_efficiency.png", dpi=300)
    plt.close()


def save_fig_clarification_impact(df: pd.DataFrame, out_dir: Path):
    plot_df = df.copy()
    plot_df["clarification_rounds"] = pd.to_numeric(plot_df["clarification_rounds"], errors="coerce")
    plot_df["relevance_score_human"] = pd.to_numeric(plot_df["relevance_score_human"], errors="coerce")
    plot_df["task_time_sec"] = pd.to_numeric(plot_df["task_time_sec"], errors="coerce")
    plot_df = plot_df.dropna(subset=["clarification_rounds", "relevance_score_human", "task_time_sec"])
    if plot_df.empty:
        return

    agg = (
        plot_df.groupby("clarification_rounds", dropna=False)[["relevance_score_human", "task_time_sec"]]
        .mean()
        .reset_index()
        .sort_values("clarification_rounds")
    )

    fig, ax1 = plt.subplots(figsize=(9, 5))
    ax2 = ax1.twinx()
    ax1.plot(agg["clarification_rounds"], agg["relevance_score_human"], marker="o", color="tab:blue", label="Relevance")
    ax2.plot(agg["clarification_rounds"], agg["task_time_sec"], marker="s", color="tab:orange", label="Task Time")
    ax1.set_title("Impact of Clarification Rounds on Quality and Time")
    ax1.set_xlabel("Clarification Rounds")
    ax1.set_ylabel("Relevance Score", color="tab:blue")
    ax2.set_ylabel("Task Time (sec)", color="tab:orange")

    # Merge legends from both axes.
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="best")
    fig.tight_layout()
    fig.savefig(out_dir / "fig10_clarification_impact.png", dpi=300)
    plt.close(fig)


def _draw_box(ax, xy, text, width=1.9, height=0.7, fc="#e8f0fe"):
    x, y = xy
    patch = FancyBboxPatch(
        (x, y),
        width,
        height,
        boxstyle="round,pad=0.02,rounding_size=0.06",
        linewidth=1.2,
        edgecolor="#355c7d",
        facecolor=fc,
    )
    ax.add_patch(patch)
    ax.text(x + width / 2, y + height / 2, text, ha="center", va="center", fontsize=9)


def save_fig_buyer_flow_diagram(out_dir: Path):
    fig, ax = plt.subplots(figsize=(14, 5))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 6)
    ax.axis("off")

    nodes = [
        ("ParseInput", (0.5, 2.6)),
        ("NeedMediaOps", (2.6, 2.6)),
        ("MediaProcessing", (4.7, 2.6)),
        ("BuildRequirement", (6.8, 2.6)),
        ("NeedClarify", (8.9, 2.6)),
        ("AskClarifyingQ", (11.0, 4.2)),
        ("SearchMarketplaces", (11.0, 1.0)),
        ("RankAndCompose", (13.1, 1.0)),
        ("Done", (15.2, 1.0)),
    ]

    for label, pos in nodes:
        _draw_box(ax, pos, label)

    arrows = [
        ((2.4, 2.95), (2.6, 2.95)),
        ((4.5, 2.95), (4.7, 2.95)),
        ((6.6, 2.95), (6.8, 2.95)),
        ((8.7, 2.95), (8.9, 2.95)),
        ((10.8, 2.95), (11.0, 4.55)),  # clarify path
        ((12.9, 4.55), (12.9, 1.35)),  # answer loops down
        ((10.8, 2.95), (11.0, 1.35)),  # no clarify path
        ((12.9, 1.35), (13.1, 1.35)),
        ((15.0, 1.35), (15.2, 1.35)),
    ]
    for start, end in arrows:
        ax.annotate("", xy=end, xytext=start, arrowprops=dict(arrowstyle="->", lw=1.4, color="#1f2d3d"))

    ax.text(12.2, 3.55, "if clarify needed", fontsize=8, color="#37474f")
    ax.text(11.7, 2.0, "if sufficient", fontsize=8, color="#37474f")
    ax.text(13.0, 2.9, "ANSWER loop", fontsize=8, color="#37474f", rotation=270)
    ax.set_title("Buyer Flow LangGraph State Machine (10-node conceptual view)", fontsize=12, pad=10)
    fig.tight_layout()
    fig.savefig(out_dir / "fig1_buyer_flow_diagram.png", dpi=300)
    plt.close(fig)


def save_fig_architecture_diagram(out_dir: Path):
    fig, ax = plt.subplots(figsize=(14, 7))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 10)
    ax.axis("off")

    # Clients
    _draw_box(ax, (0.8, 7.8), "Web App (React)")
    _draw_box(ax, (0.8, 6.6), "iOS App (Planned)", fc="#fef3c7")

    # Core service
    _draw_box(ax, (4.0, 7.1), "Orchestrator Service\n(FastAPI + LangGraph)", width=2.8, height=1.2, fc="#d1fae5")

    # Downstream services
    _draw_box(ax, (8.0, 8.0), "Catalog Service", width=2.2)
    _draw_box(ax, (8.0, 6.5), "Seller Crosspost", width=2.2)
    _draw_box(ax, (8.0, 5.0), "Media Service", width=2.2)

    # Data/infra
    _draw_box(ax, (11.4, 8.0), "DynamoDB", width=2.0, fc="#ede9fe")
    _draw_box(ax, (11.4, 6.5), "SQS", width=2.0, fc="#ede9fe")
    _draw_box(ax, (11.4, 5.0), "S3", width=2.0, fc="#ede9fe")
    _draw_box(ax, (11.4, 3.5), "AWS Bedrock", width=2.0, fc="#ede9fe")

    # Marketplaces
    _draw_box(ax, (14.0, 8.2), "Amazon/eBay/\nWalmart/BestBuy", width=1.8, height=1.0, fc="#fee2e2")
    _draw_box(ax, (14.0, 6.6), "eBay/Craigslist/\nFB/Poshmark", width=1.8, height=1.0, fc="#fee2e2")

    # Edges
    def arr(a, b):
        ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="->", lw=1.3, color="#1f2d3d"))

    arr((2.7, 8.15), (4.0, 7.8))
    arr((2.7, 6.95), (4.0, 7.5))
    arr((6.8, 8.0), (8.0, 8.4))
    arr((6.8, 7.6), (8.0, 6.9))
    arr((6.8, 7.2), (8.0, 5.4))
    arr((10.2, 8.4), (11.4, 8.4))
    arr((10.2, 6.9), (11.4, 6.9))
    arr((10.2, 5.4), (11.4, 5.4))
    arr((10.2, 5.1), (11.4, 3.9))
    arr((10.2, 8.4), (14.0, 8.7))
    arr((10.2, 6.9), (14.0, 7.1))

    ax.set_title("TalknShop High-Level System Architecture (conceptual)", fontsize=12, pad=10)
    fig.tight_layout()
    fig.savefig(out_dir / "fig2_system_architecture_diagram.png", dpi=300)
    plt.close(fig)


def main():
    sns.set_theme(style="whitegrid")

    repo_root = Path(__file__).resolve().parents[1]
    docs_dir = repo_root / "documentation"
    out_dir = docs_dir / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)

    metrics, result_quality, latency = load_data(docs_dir)
    metrics = add_sus_score(metrics)

    save_fig_buyer_flow_diagram(out_dir)
    save_fig_architecture_diagram(out_dir)
    save_fig_task_time(metrics, out_dir)
    save_fig_conversion_funnel(metrics, out_dir)
    save_fig_sus(metrics, out_dir)
    save_fig_turn_distribution(metrics, out_dir)
    save_fig_price_distribution(result_quality, out_dir)
    save_fig_latency(latency, out_dir)
    save_fig_listing_efficiency(metrics, out_dir)
    save_fig_clarification_impact(metrics, out_dir)
    save_fig_precision_recall(result_quality, out_dir)

    print("Exported figures to:", out_dir)
    for p in sorted(out_dir.glob("*.png")):
        print("-", p.name)


if __name__ == "__main__":
    main()
